# Architektonická rozhodnutí

Každé rozhodnutí: co, proč, jaké byly alternativy. Nejnovější nahoře.

---

## D-014 — Přepočet porcí: návrh odsouhlasen a implementován (2026-08-13)

**Co:** Čisté funkce v `src/lib/domain/servings.ts` (16 testů). Lineární koeficient + „lidské" zaokrouhlení dle §6.2; kg/l se zaokrouhlují přes ×1000 ekvivalent; koření = potravina ve stromu pod kategorií se `search_normalized='koreni'` nebo jednotka lžička/špetka; `foods.divisible_pieces` pro půlitelné kusy; špetka/dle chuti se nemění; kladná hodnota se nikdy nezaokrouhlí na nulu (bump na nejmenší krok). Varování při odchylce > 15 % — v UI ⚠️ u položky, souhrn pod ingrediencemi, přesná hodnota v tooltipu. Přepočet je jen pohled, data se nemění.
**Alternativy:** Zaokrouhlení čistě matematické (odporuje zadání), práh varování 10 %/20 % (Vojta schválil 15 %).

## D-013 — Fáze 1 a design odsouhlaseny; tabulky potravin vznikají už ve Fázi 2 (2026-08-13)

**Co:** Vojta schválil Fázi 1, design i sync návrh. Tabulky `foods`, `food_categories` (+closure), `food_units`, `store_sections` se zakládají už v migraci Fáze 2, protože `recipe_ingredients.food_id` a `food_categories.store_section_id` na ně mají FK. Plnění dat a UI potravin zůstává ve Fázi 3, sekce obchodu ve Fázi 5.
**Proč:** Čisté FK od začátku; pozdější přidávání FK na existující data je zbytečné riziko.

## D-012 — `output: 'standalone'` jen v Docker buildu (2026-08-13)

**Co:** Next.js standalone výstup se zapíná proměnnou `BUILD_STANDALONE=1` (nastaví ji Dockerfile ve Fázi 11); lokální build na Windows běží bez něj.
**Proč:** Standalone tracing vytváří symlinky do pnpm store a Windows je bez zvláštních oprávnění nepovolí (EPERM). V Linuxu (Docker) problém není.
**Alternativy:** Zapnout Windows Developer Mode (zásah do nastavení systému, nechceme), stavět lokálně jen v Dockeru (pomalé pro vývoj).

## D-011 — Sync protokol a Fáze 1 odsouhlaseny Vojtou (2026-08-13)

**Co:** docs/SYNC.md schválen („OK") včetně field-level LWW, checked-wins a 90denní retence change_logu. Fonty přes balíčky @fontsource-variable (self-hosted, bez CDN).

## D-010 — Fonty: Fraunces + Inter, self-hostované (2026-08-13)

**Co:** Nadpisy serif Fraunces, UI sans Inter; oba variabilní, s češtinou, licence OFL, soubory v repu. Stejné soubory pro web (`next/font/local`) i PDF (`@react-pdf/renderer`).
**Proč:** Žádný CDN (soukromí, offline, Tailscale), jedna sada fontů všude, diakritika v PDF vyřešená od začátku.
**Alternativy:** Google Fonts CDN (odpadá — externí závislost), Playfair Display (tvrdší, méně „domácký" než Fraunces).

## D-009 — Zálohy přes sidecar kontejner s cronem (2026-08-13)

**Co:** Samostatný `backup` kontejner v compose (postgres-client + cron): denní pg_dump + tar uploads, retence 7/4/12, výsledky do `backup_runs`, ruční spuštění přes trigger soubor. Tentýž cron dělá úklid expirovaných tokenů/sessions.
**Proč:** Nezávislé na životě app kontejneru, jednoduché, bez externích služeb.
**Alternativy:** Cron uvnitř app kontejneru (spadne s appkou, míchá zodpovědnosti), host cron na OMV (mimo compose, hůř přenositelné).

## D-008 — Sync: field-level LWW přes `field_mtimes` jsonb na řádku (2026-08-13)

**Co:** Každý synchronizovaný řádek nese `field_mtimes` (pole → čas poslední změny), udržované společným zápisovým helperem pro online API i sync push. Merge po polích; `effectiveTs = min(clientTs, čas přijetí)`; checked/done vyhrává u souběžných konfliktů; delete vyhrává nad update; zahozené změny se hlásí uživateli. Idempotence pushů přes `sync_applied_ops`, kurzor přes `change_log.seq`. Detail v docs/SYNC.md.
**Proč:** Field-level merge bez samostatné tabulky verzí (méně JOINů), clamp řeší rozjeté hodiny, pravidla odpovídají zadání §7.
**Alternativy:** Row-level LWW (přepisoval by souběžné editace různých polí), CRDT (zbytečně složité pro 2 uživatele), tabulka `sync_field_state` (víc zápisů a JOINů než jsonb na řádku).

## D-007 — Datový model odsouhlasen Vojtou (2026-08-13)

**Co:** Návrh v docs/DATA-MODEL.md schválen bez výhrad, včetně closure table, JSONB snapshotů, rrule opakování a mapování sekcí obchodu přes food_categories.
**Proč:** Explicitní souhlas v konverzaci.

## D-006 — Nutriční hodnoty: typované sloupce ve `foods`, snapshoty jako JSONB (2026-08-13)

**Co:** `foods` má pevné typované sloupce (energy_kj, protein_g, carbs_g, sugars_g, fiber_g, fat_g, sat_fat_g, salt_g — vše nullable). Snapshoty v deníku a nutriční cíle používají obecný klíč veličiny (`nutrient_key`), deník ukládá JSONB mapu.
**Proč:** Sloupce = typová kontrola a jednoduché dotazy; JSONB u snapshotů = neměnnost historie i při budoucím přidání veličin; `nutrient_key` = obecné cíle dle požadavku Vojty (odpověď č. 8). Sůl přidána rovnou.
**Alternativy:** EAV tabulka nutrientů — zbytečně složité dotazy; JSONB i ve foods — ztráta typové kontroly u primárních dat.

## D-005 — Hierarchie kategorií: closure table (2026-08-13)

**Co:** Kategorie receptů i potravin jsou stromy uložené jako `parent_id` + closure table (`*_closure(ancestor_id, descendant_id, depth)`), udržovaná v aplikační transakci při změně stromu.
**Proč:** PK jsou UUID a `ltree` povoluje v labelech jen `[A-Za-z0-9_]` — cesty by se musely mangolvat. Closure table umí „vše pod uzlem" jedním JOINem do libovolné hloubky a přesun podstromu je jednoduchý přepočet.
**Alternativy:** `ltree` (rychlejší prefix dotazy, ale mangling UUID a extension-specific syntax), rekurzivní CTE bez pomocné tabulky (pomalé v hot-path vyhledávání receptů podle skupiny ingrediencí).

## D-004 — Jedna domácnost, bez multi-tenant logiky (2026-08-13)

**Co:** Uživatel patří právě do jedné domácnosti (unikátní index na `household_members.user_id`). UI ani API neřeší přepínání domácností. `household_id` sloupce v tabulkách zůstávají (konzistence, sync protokol, budoucnost).
**Proč:** Rozhodnutí Vojty (odpověď č. 2). Výrazně zjednodušuje API i UI.
**Alternativy:** Plný multi-tenant — zbytečný pro jednu rodinu.

## D-003 — Zodpovězené otázky z kroku 0.1 (2026-08-13, Vojta)

1. HTTPS přes `tailscale serve` (nutné pro PWA, Wake Lock, BarcodeDetector).
2. Jedna domácnost, multi-household neřešit (→ D-004).
3. Vývoj: Windows + Docker Desktop; chybějící nástroje si smím instalovat.
4. Jídelníček: více položek v jednom slotu (den × typ jídla).
5. Nákup: samostatný číselník sekcí obchodu + mapování z kategorií potravin; jedno globální pořadí sekcí.
6. Obtížnost receptu: tříbodová škála (snadné/střední/náročné).
7. Obecné kalendářní události mohou mít opakování.
8. Osobní cíle v deníku obecně pro libovolnou sledovanou veličinu.
9. Existující recepty jsou v PDF; Vojta je převede AI do importního formátu, který přesně specifikuji (→ docs/IMPORT-RECIPES.md, import ve Fázi 3).
10. Světlý i tmavý režim od začátku.

## D-002 — Repozitář založen přímo v adresáři „Nase Domacnost" (2026-08-13)

**Co:** Git repozitář je kořen pracovního adresáře `C:\Users\Jokil\Nase Domacnost`, výchozí větev `master`.
**Proč:** Adresář byl prázdný a název odpovídá projektu; vnořený podadresář by jen přidal úroveň.
**Alternativy:** Podadresář `app/` uvnitř — zavrženo, žádný jiný obsah tu není.

## D-001 — Struktura fáze 0 dle master promptu (2026-08-13)

**Co:** Krok 0.11 (repo + PROGRESS.md + DECISIONS.md) proveden jako první, před otázkami z 0.1, přesně dle sekce 14 zadání. Checklist všech 12 fází je v PROGRESS.md.
**Proč:** Aby od začátku existovalo místo, kam zapisovat stav a rozhodnutí — ochrana proti přerušení session.
**Alternativy:** Žádné relevantní.
