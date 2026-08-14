# Architektonická rozhodnutí

Každé rozhodnutí: co, proč, jaké byly alternativy. Nejnovější nahoře.

---

## D-024 — PDF fonty jako TTF v repu, zálohy smyčkou v sidecaru, import nikdy nepřepisuje (2026-08-14)

**Co:** Tři rozhodnutí Fáze 9.
- **PDF fonty:** `@react-pdf/renderer` (fontkit) neumí woff2, které jediné dodává `@fontsource`. `scripts/build-pdf-fonts.mjs` je jednorázově rozbalí do `assets/fonts/*.ttf` a ty jsou **v repu** — build i běh musí fungovat offline a diakritika v PDF nesmí záviset na stroji. Ověřeno rozborem hotového PDF: vložené podmnožiny Fraunces/Inter s korektním ToUnicode (č, š, ř). PDF je záměrně **bez nutričních hodnot** (tištěná stránka se nedá držet v souladu s katalogem potravin).
- **Zálohy:** sidecar nepoužívá cron, ale prostou smyčku `sleep 60` (obraz postgresu cron nemá a instalovat ho kvůli tomu je víc mechaniky než ta smyčka). Tatáž smyčka hlídá i ruční spuštění přes soubor `.trigger`, který zapisuje `POST /api/backups/run` — aplikace sama `pg_dump` nespouští, v produkci k němu ani nemá binárky a na uploads volume přístup. Rotace běží **až po** úspěšné záloze.
- **Import:** řádky s už existujícím `id` se **přeskakují**, nikdy nepřepisují — obnova do živé databáze nesmí umlčet novější data. Náhled běží bez dotyku databáze a kontroluje odkazy proti souboru i proti DB; existenci se testuje podle primárního klíče, a když tabulka žádný nemá (`household_members`), podle unikátního indexu — jinak náhled lhal o počtech u vazebních tabulek.
**Proč:** Zadání §11 (PDF), §12 (zálohy a export). Ověřeno obnovou do prázdné databáze: 552 řádků a 12 fotek, poškozený archiv (rozbitý odkaz, chybějící fotka, cizí `formatVersion`, nevalidní ZIP) odmítnut ve všech čtyřech případech.
**Alternativy:** Vestavěné fonty react-pdf (Helvetica nemá českou diakritiku), stahovat TTF za běhu (odporuje offline), cron v sidecaru (další balíček), import s přepisem (tichá ztráta dat).

## D-023 — Sdílení: rozhodovací matice jako čistá funkce, kopie je vždy nezávislá (2026-08-14)

**Co:** Rozhodnutí „smí / nesmí" je čistá funkce `src/lib/domain/recipe-access.ts` (15 testů), DB vrstva (`src/lib/recipes/access.ts`) jen posbírá fakta (členství, `recipe_shares`, platnost veřejného tokenu). Pravidla: sdílení **rozšiřuje**, nikdy neomezuje (užší sdílení nesebere práva členu domácnosti); nedostupný recept se hlásí jako `not_found`, ne `forbidden` (cizí člověk se nedozví ani to, že existuje); `edit` sdílení nikdy nedává mazání ani další sdílení (to smí jen vlastník/správce domácnosti); veřejný odkaz je vždy jen ke čtení. Kopie receptu je **plná kopie včetně fotek na disku** — originál lze pak smazat, aniž se kopie rozbije; `copied_from_recipe_id` je jen provenience („Převzato od…"), kopie nedědí sdílení ani veřejné odkazy. Veřejná stránka posílá **whitelistovanou** projekci (`buildPublicRecipe`) — žádná ID, žádné nutriční hodnoty, žádná data domácnosti; fotky přes `?share=<token>` s krátkou cache, aby zneplatnění odkazu zabralo.
**Proč:** Zadání §8. Rovina „recept" a rovina „data domácnosti" jsou nezávislé, tak musí být nezávisle i vynucené. Při implementaci se ukázalo, že import receptu do nákupu, zápis do deníku a vložení do jídelníčku braly `recipeId` z requestu bez kontroly — doplněno, jinak by stačilo uhodnout UUID.
**Alternativy:** Rozhodovat přímo v SQL dotazu (netestovatelné bez DB), kopírovat fotky odkazem na tytéž soubory (smazání originálu by rozbilo kopie), vracet `forbidden` místo `not_found` (potvrzuje existenci receptu).

## D-022 — Deník: snapshot počítaný na serveru, grafy bez knihovny (2026-08-14)

**Co:** `diary_entries.nutrition` je JSONB snapshot **vypočtený na serveru** při zápisu (klientu se nevěří) a obsahuje i `incomplete` + `missing`. Záznam z receptu se škáluje počtem porcí konkrétního člověka. Čtení i zápis jsou vždy filtrované `user_id` — cizí deník nevidí ani admin. Přenos z jídelníčku je výhradně explicitní; položka jídelníčku bez receptu se uloží jako ruční záznam **bez hodnot** (nevymýšlíme čísla). Týdenní grafy jsou inline SVG, žádná grafová knihovna (bundle a výkon na Pi).
**Proč:** Zadání §10.6 + §5.5. Ověřeno testem: po zdvojnásobení všech ingrediencí receptu zůstal starší záznam v deníku beze změny (1141 kJ).
**Alternativy:** Počítat hodnoty při čtení z aktuálního receptu (porušuje neměnnost historie), recharts/chart.js (~50 kB navíc kvůli sedmi sloupcům).

## D-021 — Návrhy občasných úkolů: relativní naléhavost + strop na období (2026-08-14)

**Co:** `src/lib/domain/task-suggestions.ts` (12 testů). Šablona je „po termínu", když `poslední splnění + interval_days <= dnes`; nikdy nesplněná se počítá od svého vzniku. Řazení podle **relativní** prodlevy (`daysOverdue / intervalDays`) — týden zpoždění u týdenního úkolu váží víc než u ročního. Šablona s už otevřeným úkolem se přeskočí. Nabízí se **nejvýš 3 najednou** (parametrizovatelné); zbytek počká na další období — to je vlastní rozprostření zátěže. Při shodě vyhrává delší interval, aby vzácné velké práce nezůstávaly poslední.
**Proč:** Zadání §10.5 („občasné úkoly se rozdělují postupně mezi běžné týdny, navrhni rozumný algoritmus rozprostření zátěže"). Ověřeno: ze 6 prošlých šablon UI nabídlo 3 nejnaléhavější a po zařazení jedné se doplnila další v pořadí.
**Alternativy:** Absolutní počet dní po termínu (ročním úkolům by dával nesmyslnou prioritu), nabízet vše najednou (zahltí týden — přesně to, čemu se zadání chce vyhnout).

## D-020 — Import do nákupu slučuje s nezaškrtnutými položkami a zachovává zdroje (2026-08-14)

**Co:** Import receptu/jídelníčku do seznamu projde slučovačkou spolu s **nezaškrtnutými** položkami, které už na seznamu jsou; zaškrtnuté zůstanou nedotčené (rozdělaný nákup se nesmí přeházet). Původní `shopping_item_sources` se přenášejí do sloučeného řádku (`carriedSources`), takže attribuce se nikdy neztratí. Sekce obchodu se u položky odvodí z nejbližšího předka ve stromu potravin a uloží jako snapshot.
**Proč:** Opakovaný import nesmí tvořit duplicity ani mazat historii („které recepty, který den" dle §6.5). Chybu s mizejícími zdroji odhalil integrační test, pokryto i jednotkovým testem.
**Alternativy:** Slučovat i zaškrtnuté položky (rozbilo by rozdělaný nákup), nikdy neslučovat s existujícími (duplicity při každém importu).

## D-019 — Slučování nákupu jen při jednoznačném převodu (2026-08-14)

**Co:** `src/lib/domain/shopping-merge.ts` (12 testů). Slučuje se podle `food_id` (u volného textu podle normalizovaného názvu) a jen v rámci „kbelíku": hmotnost (g↔kg), objem (ml↔l), nebo shodná jednotka (ks, lžíce). Gramy a mililitry se **neslučují ani při známé hustotě** — uživatel kupuje jinou věc. Výsledek se zobrazí v přívětivé jednotce (1 800 g → 1,8 kg).
**Proč:** Zadání §6.5. Převod g↔ml u nákupu mate (500 g mouky ≠ 500 ml mouky v obchodě).
**Alternativy:** Slučovat vše přes gramy (skryje, co se má koupit), neslučovat vůbec (nesplňuje zadání).

## D-018 — Tabulky úkolů vznikají už ve Fázi 4 (2026-08-14)

**Co:** `tasks`, `task_lists`, `task_assignees` se zakládají v migraci Fáze 4, protože přijatý návrh „připravit předem" vytváří skutečný úkol (FK) a ten se hned zobrazí v kalendáři. Plná správa úkolů přijde ve Fázi 6.
**Proč:** Stejná logika jako D-013 u potravin — čisté FK od začátku a přijetí návrhu má viditelný efekt.

## D-017 — Import receptů: párování bez diakritiky + náhled před uložením (2026-08-13)

**Co:** Formát v docs/IMPORT-RECIPES.md (`formatVersion: 1`, JSON, včetně hotového promptu pro AI). Import je dvoufázový: náhled (kolik receptů, kolik ingrediencí se spárovalo, co ne, jaké kategorie/tagy vzniknou) → potvrzení. Párování potravin: přesná shoda normalizovaného názvu, jinak trigram `similarity > 0.55`; pod prahem zůstane volný text. Kategorie a tagy se hledají podle názvu, nenalezené vzniknou. BOM se před parsováním odstraňuje (Windows editory).
**Proč:** Vojta převede PDF recepty přes AI; formát musí být strojově spolehlivý a import nesmí nic tiše rozbít.
**Alternativy:** Přímý import PDF (nespolehlivé), automatické zakládání potravin z nespárovaných názvů (zavlekly by se nesmysly bez nutričních hodnot).

## D-016 — Open Food Facts: dvoukrokové vyhledávání (2026-08-13)

**Co:** Vyhledávání jde na `search.openfoodfacts.org` (starý `/cgi/search.pl` vrací 503) a vrací jen identifikaci; nutriční hodnoty se načtou až po výběru přes `world.openfoodfacts.org/api/v2/product/<kód>`. HTTP 404 = „produkt neexistuje", ne výpadek. Vlastní User-Agent, cache 30 dní v `off_cache`, globální i uživatelský rate limit.
**Proč:** Vyhledávací služba nutriční hodnoty nevrací; dvoukrok navíc odpovídá zadání „nalezenou položku uživatel potvrdí" a šetří zátěž OFF.
**Alternativy:** Načítat detaily všech výsledků najednou (12 requestů na jedno hledání — zbytečná zátěž).

## D-015 — Nutriční výpočty: převody, součty, reverzní výpočet (2026-08-13)

**Co:** Tři čisté knihovny v `src/lib/domain/`, schváleno Vojtou předem.
- `units.ts` — převody vrací buď hodnotu, nebo **důvod selhání** (`no_density`, `no_grams_per_piece`, `no_food_unit`, `not_quantifiable`…). Nikdy se nehádá. Lžíce/lžička jen z `food_units` dané potraviny (lžíce mouky ≠ lžíce oleje).
- `nutrition.ts` — hodnoty se škálují podle `reference_unit` (100g/100ml/piece). Chybějící hodnota zůstává `null`, nikdy se nenahrazuje nulou. Nepřevoditelná ingredience se nezapočítá a recept se označí `incomplete` se seznamem chybějícího. `nutrition_override` nahrazuje hodnoty potraviny **na referenční jednotku** jen v daném receptu a hlásí se přes `overriddenKeys`. Volitelné ingredience se počítají a UI to uvede. Na porci = celek / základní porce (konstantní při škálování).
- `reverse.ts` — obecně přes libovolnou veličinu (`NutrientKey`), koeficient `k` na odemčené ingredience; chyby `no_free_contribution`, `locked_exceeds_target`, `invalid_target`; varování při k < 0,3 nebo k > 3; po zaokrouhlení se **přepočítá skutečná výsledná hodnota** a reportuje se místo teoretické.
- 59 jednotkových testů (Vitest) pokrývá i okrajové případy ze zadání (2 ks vejce bez hmotnosti, špetka, zamčené ingredience překračující cíl).

**Alternativy:** Globální tabulka převodů lžic (odmítnuto — lže), dosazování nul za chybějící hodnoty (odmítnuto — tichá lež v součtech).

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
