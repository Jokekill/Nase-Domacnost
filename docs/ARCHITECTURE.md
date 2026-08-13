# Architektura — autentizace, oprávnění, fotky, zálohy

**Stav:** návrh (kroky 0.4–0.7), 2026-08-13.

---

## 1. Autentizace (krok 0.7)

Ručně implementovaná, bez knihoven třetí strany (viz zadání §4).

### 1.1 Hesla

- **argon2id** přes `@node-rs/argon2` (prebuilt binárky pro glibc ARM64
  i x64). Parametry: memory 19 MiB, iterations 2, parallelism 1 (doporučení
  OWASP pro interaktivní login; Pi 5 to zvládne < 200 ms).
- Fallback plán: pokud by na ARM64 nastal problém, `bcryptjs` (čisté JS),
  cost 11. Hash formát je v DB samopopisný, migrace mezi algoritmy = rehash
  při nejbližším úspěšném loginu.

### 1.2 Session

- Tabulka `sessions`; do cookie jde náhodných 32 B (base64url), v DB jen
  **SHA-256 hash** tokenu — únik DB neumožní převzetí session.
- Cookie: `__Host-session`, `httpOnly`, `Secure`, `SameSite=Lax`, `Path=/`.
  (Tailscale serve dává HTTPS, `Secure` tedy platí i doma; pro lokální vývoj
  na `http://localhost` prefix `__Host-` vynechán dev flagem.)
- Expirace **90 dní klouzavě**: `expires_at` se posune, když je session
  starší poloviny okna (ne při každém requestu — méně zápisů).
- **Rotace tokenu při každém přihlášení**; logout maže řádek. Periodický
  úklid expirovaných sessions (viz zálohovací sidecar §4.4).
- Rate limit na `/api/auth/login` a reset hesla: in-memory token bucket
  (jedna instance appky, stačí), 10 pokusů / 15 min / IP+e-mail.

### 1.3 Registrace, pozvánky, reset

- **První registrovaný uživatel** založí domácnost a stane se adminem.
  Další registrace **jen s platným tokenem pozvánky** (jednorázový,
  expirace 7 dní, v DB hashovaný).
- Reset hesla: jednorázový token, expirace 1 h; e-mail se zatím **loguje do
  konzole** (SMTP později — v UI je vidět instrukce „požádej admina").

---

## 2. Oprávnění (krok 0.4)

Dvě nezávislé roviny (zadání §8), vynucené **na API vrstvě u každého
požadavku** — nikdy jen skrýváním v UI.

### 2.1 Vrstvy vynucení

Každý handler prochází helpery (v `src/lib/auth/`):

1. `requireUser(req)` → session → `user`, jinak 401.
2. `requireHousehold(user)` → členství + role, jinak 403. Všechna data
   domácnosti (jídelníček, nákup, úkoly, kalendář, deník, potraviny,
   kategorie, nastavení) **vždy** filtrována `household_id` z členství —
   ID z requestu se nikdy nepoužívá jako zdroj pravdy.
3. `requireRecipeAccess(user, recipeId, 'view' | 'edit')` → viz matice níže.
4. `requireAdmin(user)` pro správu členů, pozvánek, číselníků mazání
   a záloh.

Deník je navíc **per uživatel**: `diary_entries` a `nutrition_goals` vždy
filtrovány `user_id = session.user` (ani admin nevidí cizí deník).

### 2.2 Matice přístupu k receptu

| visibility / vztah | vlastník | člen domácnosti vlastníka | uživatel v `recipe_shares` | držitel public tokenu |
|---|---|---|---|---|
| `private`   | view+edit | — | — | — |
| `household` | view+edit | view+edit+kopie (mazání jen vlastník/admin) | — | — |
| `shared`    | view+edit | dle `household`* | dle `permission` (view/edit) | — |
| public link (flag) | view+edit | * | * | view (jen recept, bez fotek v plné kvalitě? → ne, fotky ano; bez jakýchkoli dat domácnosti) |

\* `shared` a public link viditelnost **rozšiřují**, neomezují: recept sdílený
konkrétnímu uživateli zůstává viditelný domácnosti, pokud má zároveň
`visibility='household'`.

- Uživatel s přístupem **jen k receptu** se nedostane k žádnému endpointu
  domácnosti (vrstva 2 ho zastaví — není členem).
- Kopírování: `POST /api/recipes/:id/copy` vyžaduje `view`; kopie patří
  kopírujícímu, `copied_from_recipe_id` zachová odkaz, fotky se fyzicky
  zkopírují.
- Role `child` (budoucnost): přidá se hodnota do `household_members.role`
  a mapa „modul → povolen/zakázán" v helperu `requireHousehold` — struktura
  na to je připravená, nic víc teď neděláme.

---

## 3. Fotografie (krok 0.5)

### 3.1 Uložení

```
/data/uploads/<household_id>/<yyyy>/<mm>/<uuid>.<ext>      originál
/data/uploads/<household_id>/<yyyy>/<mm>/<uuid>_thumb.webp  400w
/data/uploads/<household_id>/<yyyy>/<mm>/<uuid>_card.webp   800w
/data/uploads/<household_id>/<yyyy>/<mm>/<uuid>_full.webp  1600w
```

`recipe_photos.storage_key` = cesta bez přípony varianty. Disk = Docker
volume; DB drží jen metadata.

### 3.2 Upload pipeline

1. `POST /api/recipes/:id/photos` (multipart, limit 25 MB, jen
   jpeg/png/webp/heic — kontrola magic bytes, ne přípony).
2. `sharp`: přečti EXIF **orientaci** → `.rotate()`, ostatní metadata zahoď;
   vygeneruj 3 varianty WebP (kvalita 80); ulož + originál.
3. Zápis `recipe_photos` v téže transakci; při selhání úklid souborů.
4. HEIC (iPhone): `sharp` s libheif umí dekódovat — ověřit v Docker buildu,
   případně omezit na jpeg/png/webp a v UI o tom informovat (rozhodne se
   ve Fázi 2 podle testu).

### 3.3 Servírování

- `GET /api/files/<storageKey>?v=thumb|card|full|orig` — ověří session
  a právo na recept, pak streamuje soubor.
- `Cache-Control: private, max-age=31536000, immutable` — klíč obsahuje
  UUID, obsah se nikdy nemění, jen přibývá/maže.
- Service worker (Fáze 10) cachuje `thumb` + `card` naposledy zobrazených
  receptů.

---

## 4. Zálohování (krok 0.6)

### 4.1 Automatická denní záloha

- **Sidecar kontejner** `backup` v docker-compose (image s `postgres-client`
  + busybox cron). Důvod: nezávislý na životě app kontejneru, má přístup na
  oba volumy.
- Každou noc 03:00: `pg_dump -Fc` (custom formát, komprimovaný) + `tar.gz`
  přírůstek `/data/uploads` → `/data/backups/daily/<datum>/`.
- **Retence 7 denních / 4 týdenních / 12 měsíčních**: promoce nedělní zálohy
  na týdenní, zálohy z 1. dne měsíce na měsíční; starší se mažou skriptem po
  úspěšném dokončení nové zálohy (nikdy před ním).
- Výsledek každého běhu zapíše do `backup_runs` (přes psql) → UI Nastavení
  čte `GET /api/backups/status` a **zvýrazní**, když je poslední úspěšná
  záloha starší 48 h.

### 4.2 Ruční záloha

`POST /api/backups/run` (admin) → app pošle signál sidecaru (sdílený
`/data/backups/.trigger` soubor, cron smyčka ho kontroluje každou minutu)
nebo spustí tentýž skript přímo. Výsledek opět v `backup_runs`.

### 4.3 Export / import

- `GET /api/export`: ZIP `data.json` + `photos/` — čitelný, verzovaný formát
  (`formatVersion`), specifikace v docs/EXPORT-FORMAT.md (Fáze 9).
- `POST /api/import`: dvoufázově — (1) upload + validace + **náhled** (počty,
  kolize, chybějící vazby), (2) potvrzení. Kontrola integrity: každá
  reference v data.json musí existovat, fotky musí mít soubor v ZIP.
- Cíl: obnova na čistém serveru = `docker compose up` + import ZIPu, ověří
  se v kroku 11.6.

### 4.4 Údržba

Tentýž sidecar cron denně: úklid expirovaných `sessions`,
`password_reset_tokens`, `household_invites` a starých `off_cache` záznamů.
