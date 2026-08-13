# Architektonická rozhodnutí

Každé rozhodnutí: co, proč, jaké byly alternativy. Nejnovější nahoře.

---

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
