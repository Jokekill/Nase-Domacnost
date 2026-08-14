# STAV PROJEKTU

**Poslední aktualizace:** 2026-08-14
**Aktuální fáze:** Fáze 11 — doladění a nasazení (hotovo vše kromě 11.5)
**Právě rozpracováno:** nic
**Další krok:** na Vojtovi — nasadit na Pi dle docs/DEPLOY.md (11.5) a zkontrolovat service worker v Chromu (10.2/10.7, postup níže)

**POZOR pro příští session:** nikdy nespouštět `pnpm build`, když běží dev server — přepíše mu `.next` a server pak vrací 500 (nutný restart dev serveru).

## Jak projekt spustit

```bash
docker compose up -d db backup   # backup = zálohovací sidecar (Fáze 9)
pnpm install
pnpm db:migrate
pnpm db:seed        # volitelné: testovací účty (jen do prázdné DB)
pnpm dev            # http://localhost:3000
```

Testovací přihlášení: vojta@test.local / heslo123 (admin), eliska@test.local / heslo123 (člen).

## Jak ověřit service worker (zbytek kroku 10.2/10.7)

Vestavěný prohlížeč v Claude Code neumí načíst skript service workeru
(`register()` skončí „unknown error occurred when fetching the script"), takže
tohle musí projít Vojta v Chromu. Dev server service worker nemá — je potřeba
produkční build:

```bash
NEXT_DIST_DIR=.next-prod pnpm build
NEXT_DIST_DIR=.next-prod PORT=3100 pnpm start
```

Pozor: build přepíše `next-env.d.ts` a `tsconfig.json` odkazem na `.next-prod`
— před commitem vrátit (`git checkout next-env.d.ts tsconfig.json`).

V Chromu na `http://localhost:3100` (localhost je secure context, HTTPS není
potřeba), přihlásit se a projít:

1. **DevTools → Application → Service Workers** — má být jeden, stav
   `activated and is running`, zdroj `/sw.js`. Pokud zůstane `installing`,
   selhalo precachování (viz `scripts/normalize-sw-precache.mjs`).
2. **Application → Cache Storage** — `serwist-precache-v2-…` má ~142 položek.
3. Otevřít recept s fotkou, pak **Application → Cache Storage → recipe-photos**
   — mají tam přibýt `/api/files/…` (to je ta LRU cache fotek z bodu 10.7).
4. **Network → Offline** (ne vypnutá wifi, ať běží localhost), pak **F5** na
   `/kucharka`: stránka se má načíst z cache a ukázat pruh „Offline — ukazuji
   poslední staženou kopii" a fotky. Bez service workeru by přišel dinosaurus.
5. **Instalace na plochu:** v adresním řádku ikona instalace (nebo ⋮ → Odeslat,
   uložit a sdílet → Instalovat stránku jako aplikaci). Po instalaci se má
   aplikace otevřít v samostatném okně bez adresního řádku a startovat na
   `/kucharka` (`start_url` v manifestu).
6. **Na telefonu** (Android Chrome přes `tailscale serve`, tedy HTTPS): totéž
   plus „Přidat na plochu"; iOS Safari nabízí Sdílet → Přidat na plochu.

Ověřeno bez prohlížeče: `/sw.js` se servíruje (200, `application/javascript`,
~52 kB), všech 142 položek precache manifestu vrací na produkčním serveru 200,
manifest i všechny tři ikony (192, 512, maskable) se načítají.
Pozn.: dev prostředí na tomto stroji má Node 22 + pnpm 10 (instalováno přes winget) a Docker Desktop (starší, 20.10 — funguje).

## Známé problémy / TODO

- [ ] `pnpm build` lokálně na Windows běží bez `output: 'standalone'` (symlink EPERM); Docker build nastaví `BUILD_STANDALONE=1` — viz next.config.ts
- [ ] HEIC upload fotek — ověřit podporu sharp/libheif v Docker buildu (Fáze 2)
- [ ] SMTP pro reset hesla zatím chybí — odkaz se loguje do konzole serveru (záměr, viz ARCHITECTURE.md §1.3)
- [ ] CI workflow (.github/workflows/ci.yml) je připravený, ale repo nemá GitHub remote — aktivuje se až po pushnutí
- [ ] Skener čárových kódů potřebuje HTTPS (secure context) — na notebooku funguje jen přes localhost, na Pi to zajistí `tailscale serve`
- [ ] Export ZIP obsahuje hashe hesel a osobní deníky všech členů — chránit soubor jako heslo (viz docs/EXPORT-FORMAT.md §3); lze vypnout přepínačem
- [ ] Vizuální kontrola vygenerovaného PDF zatím na Vojtovi — tento stroj nemá rastrovač PDF (poppler), ověřeno jen strukturálně (vložené fonty, ToUnicode s diakritikou)
- [ ] Sdílení mezi domácnostmi je připravené v datech i API, ale reálně tu je jedna domácnost (D-004). Kdyby vznikla druhá: editor sdíleného receptu vybírá potraviny ze svého vlastního katalogu — vyřešit až se to stane
- [ ] Veřejné odkazy jsou vypnuté (`PUBLIC_SHARING_ENABLED=false`); zapnutí vyžaduje restart aplikace
- [ ] Nutriční hodnoty v seedu jsou průměrné referenční hodnoty z veřejných tabulek — u konkrétních výrobků se mohou lišit, lze opravit v Nastavení → Potraviny
- [ ] Produkční build s `NEXT_DIST_DIR=.next-prod` přepíše `next-env.d.ts` a `tsconfig.json` (odkazy na `.next-prod`) — před commitem `git checkout next-env.d.ts tsconfig.json`
- [ ] Offline se nepoužijí filtry kuchařky podle kategorií, štítků a skupin potravin (vazební tabulky nejsou v zrcadle) — obrazovka to napíše; kdyby to vadilo, posílat `categoryIds`/`tagIds` v řádku receptu jako u úkolů

## Rozhodnutí, která čekají na Vojtu

- [ ] Odsouhlasení Fází 3, 4, 5, 6, 7 a 8
- [ ] **Ověřit service worker a instalaci na plochu v Chromu** — postup výše. Vojta 2026-08-14 rozhodl pokračovat dál s tím, že to zkontroluje dodatečně; do té doby to nikdo neviděl běžet (viz 10.2/10.7)
- [ ] **Recepty k importu:** formát je hotový v docs/IMPORT-RECIPES.md včetně promptu pro AI — můžeš začít převádět PDF a nahrát je v Kuchařka → Import

---

# CHECKLIST

## Fáze 0 — Analýza a návrh (žádný aplikační kód)

- [x] 0.11 Založení repozitáře, PROGRESS.md, docs/DECISIONS.md, kompletní checklist — hotovo 2026-08-13 *(uděláno jako první krok dle zadání)*
- [x] 0.1 Analýza požadavků, seznam nejasností a otázek — hotovo 2026-08-13, odpovědi zapsány v docs/DECISIONS.md (D-003)
- [x] 0.9 Seznam nejrizikovějších částí a plán řešení — odesláno 2026-08-13 spolu s otázkami
- [x] 0.2 Návrh datového modelu → docs/DATA-MODEL.md — odsouhlaseno Vojtou 2026-08-13 (D-007)
- [x] 0.3 Návrh API → docs/API.md — hotovo 2026-08-13
- [x] 0.4 Návrh systému oprávnění — hotovo 2026-08-13, docs/ARCHITECTURE.md §2
- [x] 0.5 Návrh ukládání fotek — hotovo 2026-08-13, docs/ARCHITECTURE.md §3
- [x] 0.6 Návrh zálohování — hotovo 2026-08-13, docs/ARCHITECTURE.md §4
- [x] 0.7 Návrh autentizace — hotovo 2026-08-13, docs/ARCHITECTURE.md §1
- [x] 0.8 Návrh sync protokolu → docs/SYNC.md — odsouhlaseno Vojtou (D-011), aktualizováno při implementaci ve Fázi 10
- [x] 0.10 Vizuální identita → docs/DESIGN.md — hotovo 2026-08-13

## Fáze 1 — Základ

- [x] 1.1 Docker Compose (postgres 16 + volume) — hotovo 2026-08-13 (app kontejner až ve Fázi 11, viz docker-compose.yml)
- [x] 1.2 Next.js 15 skeleton (App Router, TS strict, standalone podmíněně), pnpm, ESLint, Prettier — hotovo 2026-08-13
- [x] 1.3 Tailwind v4 design tokens dle docs/DESIGN.md, světlý+tmavý režim, fonty Fraunces+Inter (fontsource) — hotovo 2026-08-13 (shadcn/ui komponenty se přidají ve Fázi 2 podle potřeby)
- [x] 1.4 Drizzle + migrace 0000 (users, sessions, households, members, invites, reset tokeny, change_log, backup_runs) — hotovo 2026-08-13
- [x] 1.5 Rozšíření unaccent, pg_trgm, uuid-ossp + immutable_unaccent + triggery (set_updated_at, log_change) — migrace 0001, hotovo 2026-08-13
- [x] 1.6 Autentizace: argon2id, hashované session tokeny, klouzavá expirace, rate limiting — hotovo 2026-08-13
- [x] 1.7 Domácnost: první uživatel = admin + založení, pozvánky (jednorázový token, 7 dní), role — hotovo 2026-08-13
- [x] 1.8 Reset hesla (token 1 h, log do konzole, zneplatnění sessions) — hotovo 2026-08-13
- [x] 1.9 Layout a navigace: mobilní spodní lišta (Kuchařka první), desktop horní lišta, auth stránky, Nastavení — hotovo 2026-08-13
- [x] 1.10 Health-check endpoint /api/health (ověřeno: {"status":"ok","db":"ok"}) — hotovo 2026-08-13
- [x] 1.11 CI workflow připraven (.github/workflows/ci.yml: lint+typecheck+test+build); lokálně vše prochází — hotovo 2026-08-13
- [x] 1.12 Akceptace: ověřeno v prohlížeči — registrace Vojty (založena domácnost Mykiskovi, admin), pozvánka, registrace Elišky přes pozvánku (člen), odhlášení/přihlášení, oba režimy vzhledu — 2026-08-13

## Fáze 2 — Kuchařka (nejdůležitější fáze)

- [x] 2.1 Schéma a migrace (0002+0003): kuchařka kompletní + foods/food_categories/food_units/store_sections dopředu kvůli FK (D-013); search_tsv, GIN indexy, triggery — hotovo 2026-08-13
- [x] 2.2 CRUD receptů — agregát (skupiny, ingredience, kroky, kategorie, tagy, prep_ahead), Zod, idempotentní POST — hotovo 2026-08-13
- [x] 2.3 Fotky: sharp thumb/card/full WebP + originál, EXIF orientace, /api/files s oprávněním (ověřeno testem: varianty 200, anonym 401) — hotovo 2026-08-13
- [x] 2.4 Editor receptu vč. food pickeru (hledání/vytvoření potraviny, skupina kvůli hledání) — hotovo 2026-08-13
- [x] 2.5 Kategorie: strom + closure (create/move/delete s ochranou cyklů), API — hotovo 2026-08-13 (UI správy stromu zatím jen ploché — plná správa v Nastavení přijde s Fází 3 u food_categories)
- [x] 2.6 Tagy (vytvoření přímo v editoru) — hotovo 2026-08-13
- [x] 2.7 Přehled karet s fotkou + „Načíst další" stránkování — hotovo 2026-08-13
- [x] 2.8 Detail receptu (fotky, skupiny ingrediencí, kroky, prep-ahead banner) — hotovo 2026-08-13
- [x] 2.9 Přepočet porcí — návrh schválen (D-014), lib s 16 testy, stepper na detailu, varování při >15 % odchylce, foods.divisible_pieces (migrace 0004) — hotovo 2026-08-13, ověřeno v prohlížeči (300 g → 450 g při 4→6)
- [x] 2.10 Režim vaření: krok na obrazovku, ingredience jako krok 0, Wake Lock s re-acquire — hotovo 2026-08-13
- [x] 2.11 Vyhledávání: bez diakritiky, word_similarity (skloňování: „cocka" najde „čočky"), tsvector, hledá i v ingrediencích — ověřeno 2026-08-13
- [x] 2.12 Filtry: kategorie (vč. podstromu), tagy, čas, obtížnost, skupina potravin obsahuje/neobsahuje; čipy aktivních filtrů — hotovo 2026-08-13 (mobilní bottom-sheet varianta odložena, panel je responzivní)
- [x] 2.13 Akceptace Fáze 2 splněna 2026-08-13: recept s fotkou přes UI, nalezení bez diakritiky („dhal", „cocka"→„čočky"), podle ingredience (includeFoodId) i skupiny (Luštěniny→Čočka→Červená čočka přes closure), přepočet porcí funguje

## Fáze 3 — Nutriční systém

- [x] 3.1 Schéma potravin — vzniklo už ve Fázi 2 (D-013), doplněno divisible_pieces (migrace 0004) — hotovo 2026-08-13
- [x] 3.2 Seed katalogu: 228 potravin, 44 skupin potravin, 17 kategorií receptů, převody lžic; seeduje se i při založení nové domácnosti — hotovo 2026-08-14
- [x] 3.3 Správa potravin a jednotek v UI (Nastavení → Potraviny) — hotovo 2026-08-14
- [x] 3.4 Převody jednotek + 16 testů (nikdy nehádá, vrací důvod selhání) — hotovo 2026-08-13, D-015
- [x] 3.5 Nutriční výpočty receptu a porce + panel v UI s upozorněním na nekompletnost + 11 testů — hotovo 2026-08-14
- [x] 3.6 nutrition_override na ingredienci (placeholdery z DB, ✎ indikace, návrat k DB hodnotě) — ověřeno: recept 1180 kJ, databáze netknutá — hotovo 2026-08-14
- [x] 3.7 Open Food Facts: nový vyhledávací endpoint, cache 30 dní, User-Agent, rate limit (D-016) — hotovo 2026-08-14
- [x] 3.8 Čárové kódy: BarcodeDetector + ruční zadání kódu jako fallback — hotovo 2026-08-14 *(zxing-js fallback zatím nepřidán — BarcodeDetector pokrývá Chrome/Android, na iOS je ruční zadání; doplnit až se ukáže potřeba)*
- [x] 3.9 Reverzní výpočet se zamykáním + varování + 11 testů — hotovo 2026-08-13/14
- [x] 3.10 Specifikace importního formátu → docs/IMPORT-RECIPES.md včetně promptu pro AI — hotovo 2026-08-14
- [x] 3.11 Import receptů z JSON (náhled → potvrzení, párování potravin, ošetření BOM) — hotovo 2026-08-14, D-017
- [x] 3.12 Akceptace Fáze 3 splněna 2026-08-14: bábovka 1195 kJ/porci (ruční kontrola sedí), přepis hodnot funguje jen v receptu, reverzní výpočet hlásí skutečnou hodnotu po zaokrouhlení (787 kJ místo cílových 800) a chybové stavy, 59 testů prochází

## Fáze 4 — Jídelníček a kalendář

- [x] 4.1 Schéma: meal_types, meal_plan_entries, calendar_events + overrides, prep_task_suggestions, tasks (D-018); rrule knihovna s 16 testy — hotovo 2026-08-14
- [x] 4.2 Týdenní plán — recept i volný text, více položek ve slotu, porce (předvyplněné z receptu), kdo připravuje — hotovo 2026-08-14
- [x] 4.3 Měsíční i týdenní pohled kalendáře, opakování se rozbaluje při čtení (ověřeno: týdenní kroužek na 4 termínech) — hotovo 2026-08-14
- [x] 4.4 Úkoly a nákupy s obdobím jako pruh nad mřížkou kalendáře — hotovo 2026-08-14
- [x] 4.5 Návrhy přípravy předem — ověřeno: chléb na 15. 8. s 24h předstihem navrhl přípravu na 14. 8.; přijetí vytvořilo úkol viditelný v kalendáři, odmítnutý se už nenabídne — hotovo 2026-08-14

## Fáze 5 — Nákup

- [x] 5.1 Schéma: shopping_lists (období), shopping_items, shopping_item_sources — hotovo 2026-08-14
- [x] 5.2 Ruční položky, import z receptu i z celého jídelníčku za období — hotovo 2026-08-14
- [x] 5.3 Slučování podle food_id jen při jednoznačném převodu (D-019, 12 testů), zachování zdrojů při opakovaném importu (D-020) — ověřeno: mouka 500 g + 500 g → 1 kg se 2 zdroji — hotovo 2026-08-14
- [x] 5.4 Řazení podle sekcí obchodu (dědí se stromem potravin, snapshot na položce) — hotovo 2026-08-14
- [x] 5.5 Rychlé odškrtávání s optimistickým UI, 44px cíle, idempotentní endpoint (připraveno pro offline) — hotovo 2026-08-14

## Fáze 6 — Úkoly a úklid

- [x] 6.1 Schéma doplněno o template_groups, task_templates, task_completion_history (migrace 0007+0008); tasks/task_lists/task_assignees už z Fáze 4 — hotovo 2026-08-14
- [x] 6.2 Obecné seznamy úkolů (Úklid, Nákup, Opravy, Zahrada, Administrativa ze seedu) + API — hotovo 2026-08-14
- [x] 6.3 Šablony a skupiny, libovolný interval; seed 20 šablon ve 3 skupinách (Denní/Týdenní/Velký úklid) — hotovo 2026-08-14
- [x] 6.4 Průvodce úklidem: období → výběr ze šablon → vlastní úkoly → teprve pak přiřazení — hotovo 2026-08-14
- [x] 6.5 Hromadné přiřazování (vyber osobu → zaškrtni úkoly → potvrď) — ověřeno: „Přiřazeno 2 úkolů — Eliška" — hotovo 2026-08-14
- [x] 6.6 Moje/Ostatní úkoly, kdokoli může odškrtnout cizí úkol, zaznamená se kdo — ověřeno: Eliška splnila Vojtův úkol — hotovo 2026-08-14
- [x] 6.7 Historie splnění + návrhy „je čas znovu" s rozprostřením zátěže (D-021, 12 testů) — ověřeno: ze 6 prošlých nabídne 3 — hotovo 2026-08-14
- [x] 6.8 Neměnnost: úkol je kopie šablony — přejmenování šablony nezmění existující úkoly (ověřeno testem)

## Fáze 7 — Výživový deník

- [x] 7.1 Schéma diary_entries se snapshotem (JSONB vč. incomplete/missing) + nutrition_goals; migrace 0009+0010 — hotovo 2026-08-14
- [x] 7.2 Zápis z receptu (individuální porce), z potraviny, ruční hodnoty — ověřeno: Vojta 1 porce = 1141 kJ, Eliška 1,5 porce = 1712 kJ — hotovo 2026-08-14
- [x] 7.3 Přenos z jídelníčku — výhradně explicitní výběr s možností upravit porce — hotovo 2026-08-14
- [x] 7.4 Denní přehled (kJ + kcal, všech 8 veličin, upozornění na nekompletnost) — hotovo 2026-08-14
- [x] 7.5 Týdenní graf (inline SVG, bez knihovny) + průměry na den z dní se záznamy — hotovo 2026-08-14
- [x] 7.6 Volitelné osobní cíle pro libovolnou veličinu + ukazatele plnění — hotovo 2026-08-14
- [x] 7.7 Ověřeno: deník je per uživatel (cizí nevidí ani admin) a snapshot je neměnný — po zdvojnásobení ingrediencí receptu zůstal záznam na 1141 kJ

## Fáze 8 — Sdílení

- [x] 8.1 Schéma recipe_shares + recipe_public_links (migrace 0011+0012), FK a CHECK u copied_from_recipe_id, partial unique index na živé sdílení — hotovo 2026-08-14
- [x] 8.2 Matice oprávnění jako čistá funkce (15 testů) + vynucení v API; doplněna chybějící kontrola u importu do nákupu, zápisu do deníku a jídelníčku (D-023) — hotovo 2026-08-14
- [x] 8.3 Sdílení konkrétním uživatelům (view/edit) — panel na detailu receptu, rychlá volba členů i sdílení podle e-mailu; ověřeno: Eliška viděla soukromý recept jen ke čtení (PATCH/DELETE 403), po povýšení na `edit` úprava prošla, mazání a další sdílení ne — hotovo 2026-08-14
- [x] 8.4 Kopírování receptu včetně fotek, „Převzato od …" — ověřeno: kopie má vlastní soubory na disku a vlastní vlastníky, odkaz na originál zůstává — hotovo 2026-08-14
- [x] 8.5 Veřejné odkazy /share/<token> za flagem PUBLIC_SHARING_ENABLED — stránka bez session, whitelistovaná projekce bez dat domácnosti, fotky přes `?share=`; ověřeno: vypnutý flag odmítá (403/404), zneplatnění odkazu zabralo na API, fotce i stránce — hotovo 2026-08-14

## Fáze 9 — PDF a zálohy

- [x] 9.1 PDF kuchařka: výběr receptů v Kuchařce → obálka s obsahem + recept na stránku, fonty Fraunces/Inter jako TTF v `assets/fonts` (skript `scripts/build-pdf-fonts.mjs`), bez nutričních hodnot — hotovo 2026-08-14, D-024
- [x] 9.2 Zálohovací sidecar v compose: pg_dump -Fc + tar fotek, retence 7/4/12, promoce nedělní/měsíční, denní údržba tokenů; ověřeno: dump obsahuje 45 tabulek a je čitelný pro pg_restore — hotovo 2026-08-14
- [x] 9.3 `GET /api/backups/status` + `POST /api/backups/run` (admin) a sekce Zálohy v Nastavení se zvýrazněním starší než 48 h; ověřeno: tlačítko → .trigger → sidecar → nový záznam v backup_runs — hotovo 2026-08-14
- [x] 9.4 Export ZIP (data.json + všechny varianty fotek), volitelně bez hesel/fotek, docs/EXPORT-FORMAT.md — hotovo 2026-08-14
- [x] 9.5 Import dvoufázově s kontrolou integrity; ověřeno: obnova do prázdné DB (552 řádků, 12 fotek), opakovaný import nic nepřepsal, poškozené archivy odmítnuty — hotovo 2026-08-14

## Fáze 10 — Offline a PWA

- [x] 10.1 docs/SYNC.md aktualizován o odchylky zjištěné při implementaci (bootstrap zvlášť, rozsah pushe, 409 místo 410) — hotovo 2026-08-14, D-025
- [~] 10.2 @serwist/next + manifest + ikony + explicitní registrace SW; build i servírování ověřeno (200, application/javascript), precache manifest ověřen položku po položce (142× 200) — **registraci a instalaci musí potvrdit Vojta v Chromu** (postup výše; vestavěný prohlížeč skript SW nenačte). Opraven windowsový build: glob dával do precache cesty s obrácenými lomítky (`/icons\icon-192.png`), ty vracejí 308 a instalace SW kvůli tomu nikdy neskončila — `scripts/normalize-sw-precache.mjs` běží po `next build`
- [x] 10.3 Dexie mirror (20 tabulek) + outbox + evidence zahozených změn — hotovo 2026-08-14
- [x] 10.4 GET /api/sync/pull: přírůstkově podle change_log.seq, `?bootstrap=true` pro první sync, 409 při prošlém kurzoru — ověřeno
- [x] 10.5 POST /api/sync/push: idempotence podle opId (opakování vrátí `already_applied`), whitelist entit i polí — ověřeno
- [x] 10.6 Konflikty: field-level LWW, clamp hodin, odškrtnutí vyhrává, delete vs. update — 16 testů + ověřeno proti živému serveru
- [~] 10.7 Cache fotek v service workeru napsaná (CacheFirst, LRU 300 souborů); ověření čeká na 10.2. Fotky v outboxu zatím nejsou — upload je online-only
- [x] 10.8 Indikátor v hlavičce + Nastavení → Synchronizace (fronta, poslední sync, zahozené změny) — hotovo 2026-08-14
- [x] 10.9 Offline obrazovky (priority 1–4), D-026 — hotovo a ověřeno v prohlížeči 2026-08-14:
  - **kuchařka** — seznam, hledání bez diakritiky podle názvu i ingrediencí („babovka", „vejce"), detail s nutričními hodnotami počítanými ze zrcadla (2282 kJ, shodné s online), režim vaření; zápisové akce se offline schovají
  - **nákup** — seznam seznamů i detail ze zrcadla, odškrtnutí do fronty, po připojení odesláno (opraveno: mirror vracel `foodName`/`freeText`, obrazovka čte `name`, takže offline byly položky bez názvu)
  - **úkoly** — moje/ostatní podle `assigneeIds` v zrcadle, splnění přes frontu; po připojení sedí `completed_by` i řádek v `task_completion_history`
  - **deník** — záznamy, denní součty i týdenní graf ze snapshotů (1721 kJ), mazání přes frontu; zápis nového jídla zůstává online-only (D-022)
  - klíčová oprava: `networkMode: "offlineFirst"` — TanStack Query jinak při `navigator.onLine === false` pozastaví dotazy i mutace a offline větve se vůbec nespustí
  - priorita 5 (zakládání/editace receptu offline) se **nedělá**, je mimo push whitelist (D-025)

## Fáze 11 — Doladění

- [x] 11.1 Výkon — změřeno na produkčním buildu (dev server má ~550 ms fixní režie, z něj čísla neplatí): všechny endpointy 35–60 ms, `sync/pull?bootstrap=true` zrychlen z 220 na 129 ms paralelním načtením 20 tabulek. Bundle: sdílených 104 kB, největší stránka 159 kB, žádná serverová knihovna (sharp, react-pdf, drizzle, argon2) se do klientského balíku nedostala. Indexy zkontrolovány u rostoucích tabulek, doplňovat nebylo co — hotovo 2026-08-14, D-027
- [x] 11.2 Přístupnost — `useDialog` ve všech čtyřech modálech (role dialog, aria-modal, Escape, fokus dovnitř/past/návrat na spouštěč; ověřeno v prohlížeči i Playwrightem), odkaz „Přeskočit na obsah", popisky u výběru veličiny a nahrání ZIPu, karta receptu z h3 na h2, `role="status"` u hlášek, mluvící `aria-label` u týdenního grafu. Kontrast (WCAG AA) přepočítán na všech hlavních obrazovkách ve světlém i tmavém režimu — bez nálezu — hotovo 2026-08-14
- [x] 11.3 Testy — 151 jednotkových (nově 21 nad offline zrcadlem přes `fake-indexeddb`) + Playwright smoke: 6 scénářů × Chrome a Pixel, přihlášení jednou přes `storageState` (jinak narazí na vlastní rate limit). CI má nový `e2e` job s Postgresem, migrací, seedem a produkčním serverem — hotovo 2026-08-14
- [x] 11.4 Docker obraz (Debian slim kvůli sharp, standalone, healthcheck, uid 1001), `migrate` jako jednorázová služba, `app` v compose, docs/DEPLOY.md; amd64 obraz ověřen celou smoke suitou (7/7) — hotovo 2026-08-14, D-027
- [ ] 11.5 Nasazení na Raspberry Pi 5 + Tailscale — **na Vojtovi**, postup v docs/DEPLOY.md
- [x] 11.6 Obnova ze zálohy na čisté instalaci — ověřeno: `pg_restore` denního dumpu do prázdné databáze (45 tabulek, shodné počty), produkční obraz nad obnovenou databází naběhl, přihlášení i výpis receptů fungují, archiv fotek obsahuje 19 položek — hotovo 2026-08-14
- [x] 11.7 Dokumentace — README.md (co to umí, rychlý start, rozcestník) a docs/DEPLOY.md; PROGRESS a DECISIONS průběžně — hotovo 2026-08-14
