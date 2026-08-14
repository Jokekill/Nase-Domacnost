# API — přehled endpointů

**Stav:** návrh (krok 0.3), 2026-08-13. Doplňuje se průběžně při implementaci fází.

## Konvence

- Next.js Route Handlers pod `/app/api/...`, REST styl, JSON.
- Všechny vstupy validované **Zodem** (sdílená schémata v `src/lib/schemas/`,
  používá je i klient a sync vrstva).
- Autentizace: httpOnly session cookie (viz ARCHITECTURE.md §1). Bez platné
  session vrací API `401`; výjimky: `POST /api/auth/*` (login, registrace,
  reset), `GET /api/health`, `GET /api/share/<token>` (za feature flagem).
- Jednotný tvar chyby:
  ```json
  { "error": { "code": "validation_error", "message": "…", "details": {} } }
  ```
  Kódy: `validation_error`, `unauthorized`, `forbidden`, `not_found`,
  `conflict`, `rate_limited`, `internal`.
- Mutace přijímají klientem generovaná UUIDv7 `id` (sync-ready); server je
  validuje a při opakovaném POST se stejným `id` vrací existující záznam
  (idempotence).
- Stránkování seznamů: `?cursor=<opaque>&limit=` → `{ items, nextCursor }`.
- Datumy: ISO 8601, časy v UTC (`timestamptz`), dny jako `YYYY-MM-DD`.

## Auth (Fáze 1)

| Metoda | Cesta | Popis |
|---|---|---|
| POST | `/api/auth/register` | registrace (jen s platnou pozvánkou, nebo první uživatel) |
| POST | `/api/auth/login` | přihlášení, rotace session |
| POST | `/api/auth/logout` | zneplatnění session |
| GET  | `/api/auth/me` | přihlášený uživatel + role + domácnost |
| PATCH| `/api/auth/me` | jméno, preference (theme…), změna hesla |
| POST | `/api/auth/password-reset/request` | vygeneruje token (zatím log do konzole) |
| POST | `/api/auth/password-reset/confirm` | nastaví nové heslo |

## Domácnost (Fáze 1)

| Metoda | Cesta | Popis |
|---|---|---|
| GET/PATCH | `/api/household` | detail / přejmenování (PATCH jen admin) |
| GET  | `/api/household/members` | seznam členů |
| DELETE | `/api/household/members/:userId` | odebrání člena (admin) |
| POST | `/api/household/invites` | vytvoření pozvánky (admin) → jednorázový token |
| GET  | `/api/household/invites` | aktivní pozvánky (admin) |
| DELETE | `/api/household/invites/:id` | zneplatnění pozvánky (admin) |
| POST | `/api/household/invites/accept` | přijetí pozvánky (token) při registraci |

## Kuchařka (Fáze 2)

| Metoda | Cesta | Popis |
|---|---|---|
| GET  | `/api/recipes` | seznam + vyhledávání a filtry, viz níže |
| POST | `/api/recipes` | vytvoření (celý agregát: ingredience, skupiny, kroky) |
| GET  | `/api/recipes/:id` | detail (agregát včetně fotek, kategorií, tagů) |
| PATCH| `/api/recipes/:id` | úprava agregátu |
| DELETE | `/api/recipes/:id` | soft delete |
| POST | `/api/recipes/:id/copy` | kopie cizího receptu k sobě (včetně fotek) |
| POST | `/api/recipes/:id/photos` | upload fotky (multipart), vygeneruje varianty |
| PATCH| `/api/photos/:id` | pořadí, hlavní fotka |
| DELETE | `/api/photos/:id` | soft delete fotky |
| GET  | `/api/files/*storageKey` | autentizované servírování souborů (viz ARCHITECTURE.md §3) |

**Parametry `GET /api/recipes`:** `q` (fulltext bez diakritiky + fuzzy),
`categoryId` (včetně podstromu), `tagIds`, `difficulty`, `maxTotalTime`,
`includeFoodId` / `excludeFoodId`, `includeFoodCategoryId` /
`excludeFoodCategoryId` (přes closure — „s luštěninami", „bez masa"),
`maxEnergyKjPerServing` a další nutriční rozsahy (Fáze 3), `sort`, `cursor`,
`limit`. Recept se ingrediencemi a nutričními agregáty pro filtry drží
denormalizovaný souhrn (naplánováno ve Fázi 3).

Přepočet porcí a reverzní výpočet jsou **čisté funkce na klientovi**
(`src/lib/domain/`), žádný endpoint — server je používá jen při generování PDF
a snapshotů deníku.

## Kategorie, tagy (Fáze 2)

| Metoda | Cesta | Popis |
|---|---|---|
| GET  | `/api/categories` | celý strom |
| POST | `/api/categories` | nový uzel |
| PATCH| `/api/categories/:id` | přejmenování, **přesun** (`parentId`) — přepočet closure |
| DELETE | `/api/categories/:id` | soft delete (jen prázdný uzel, jinak `conflict`) |
| GET/POST/PATCH/DELETE | `/api/tags[...]` | správa tagů |

Stejné rozhraní má `/api/food-categories` (Fáze 3).

## Potraviny a výživa (Fáze 3)

| Metoda | Cesta | Popis |
|---|---|---|
| GET  | `/api/foods?q=&categoryId=` | vyhledávání potravin |
| POST/PATCH/DELETE | `/api/foods[/:id]` | správa potravin |
| POST/PATCH/DELETE | `/api/foods/:id/units[/:unitId]` | vlastní jednotky |
| GET/PATCH/DELETE | `/api/foods/:id` | detail, úprava (vč. jednotek), soft delete (blokován, pokud potravinu používají recepty) |
| GET  | `/api/off/search?q=` | hledání v Open Food Facts — vrací **jen identifikaci** (kód, název, značka, množství) |
| GET  | `/api/off/barcode/:code` | plný produkt s nutričními hodnotami + seznam `missing` |
| POST | `/api/recipes/import` | import receptů z JSON (docs/IMPORT-RECIPES.md), `mode: "preview" \| "commit"` |

## Jídelníček a kalendář (Fáze 4)

| Metoda | Cesta | Popis |
|---|---|---|
| GET  | `/api/meal-plan?from=&to=` | položky v období |
| POST/PATCH/DELETE | `/api/meal-plan/entries[/:id]` | správa položek |
| GET/POST/PATCH/DELETE | `/api/meal-types[...]` | konfigurace typů jídel |
| GET  | `/api/prep-suggestions?from=&to=` | návrhy „připravit předem" |
| POST | `/api/prep-suggestions/:id` | `{action: "accept" \| "dismiss", name?, date?}` — accept vytvoří úkol |
| GET  | `/api/calendar?from=&to=` | agregovaný pohled: jídelníček + úkoly + nákupy + události (rozbalené instance rrule) |
| POST/PATCH/DELETE | `/api/calendar/events[/:id]` | obecné události |
| PUT  | `/api/calendar/events/:id/overrides/:date` | výjimka instance opakování |

## Nákup (Fáze 5)

| Metoda | Cesta | Popis |
|---|---|---|
| GET/POST/PATCH/DELETE | `/api/shopping-lists[/:id]` | seznamy (období od–do) |
| POST | `/api/shopping-lists/:id/import` | `{recipeId, servings?}` nebo `{mealPlanFrom, mealPlanTo}`; vrací `{added, merged}` |
| POST | `/api/shopping-lists/:id/items` | ruční položka |
| PATCH/DELETE | `/api/shopping-items/:id` | úprava / soft delete |
| POST | `/api/shopping-items/:id/check` | `{checked: bool}` — idempotentní, offline-friendly |
| GET | `/api/store-sections` | sekce obchodu v pořadí průchodu obchodem |

## Úkoly (Fáze 6)

| Metoda | Cesta | Popis |
|---|---|---|
| GET/POST | `/api/task-lists` | seznamy úkolů |
| GET/POST | `/api/template-groups` | skupiny šablon |
| GET/POST | `/api/task-templates`, DELETE `/api/task-templates/:id` | šablony (`intervalDays` = null pro jednorázové) |
| GET  | `/api/tasks?from=&to=&listId=&status=` | úkoly včetně přiřazených osob |
| POST | `/api/tasks` | vytvoření: `{templateIds[], customNames[], periodStart, periodEnd, taskListId}` |
| PATCH/DELETE | `/api/tasks/:id` | úprava / soft delete |
| POST | `/api/tasks/assign` | hromadné přiřazení `{taskIds[], userId, mode: "add"\|"replace"}` |
| POST | `/api/tasks/:id/complete` | `{done: bool}` — kdokoli, zaznamená kdo splnil |
| GET  | `/api/tasks/suggestions?max=` | občasné úkoly „je čas znovu" (výchozí strop 3) |

## Deník (Fáze 7)

| Metoda | Cesta | Popis |
|---|---|---|
| GET  | `/api/diary?from=&to=` | záznamy přihlášeného uživatele (nikdy cizí) |
| POST | `/api/diary/entries` | `sourceKind: "recipe" \| "food" \| "manual"` — server spočítá a uloží snapshot |
| PATCH/DELETE | `/api/diary/entries/:id` | úprava metadat / soft delete (hodnoty snapshotu se nepřepočítávají) |
| POST | `/api/diary/from-meal-plan` | `{entryIds[], servings?}` — explicitní přenos, nikdy automaticky |
| GET  | `/api/diary/summary?from=&to=` | denní součty, průměry a cíle |
| GET/PUT | `/api/diary/goals` | osobní cíle; `targetPerDay: null` cíl zruší |

## Sdílení (Fáze 8)

| Metoda | Cesta | Popis |
|---|---|---|
| GET/POST | `/api/recipes/:id/shares` | seznam sdílení / nasdílení (`userId` nebo `email` + `permission`) |
| DELETE | `/api/recipes/:id/shares/:userId` | zrušení sdílení |
| POST | `/api/recipes/:id/copy` | kopie receptu vč. fotek do mé domácnosti |
| GET/POST | `/api/recipes/:id/public-links` | veřejné odkazy (za flagem); token se vrací **jen při vytvoření** |
| DELETE | `/api/recipes/:id/public-links/:linkId` | zneplatnění odkazu (funguje i při vypnutém flagu) |
| GET  | `/api/share/:token` | veřejný náhled receptu (bez session, za flagem) |
| GET  | `/api/files/<key>?share=<token>` | fotka sdíleného receptu pro anonyma s odkazem |

Nastavovat sdílení smí jen vlastník receptu nebo správce domácnosti — držitel
`edit` sdílení recept upravit může, ale dál sdílet ne. `GET /api/recipes/:id`
vrací navíc `permissions` (`canEdit`/`canDelete`/`canShare`), `ownerName`
a `copiedFrom`, aby UI nenabízelo, co API stejně odmítne.

## PDF, zálohy, export (Fáze 9)

| Metoda | Cesta | Popis |
|---|---|---|
| POST | `/api/pdf/cookbook` | `{recipeIds[]}` → PDF stream (bez nutričních hodnot) |
| GET  | `/api/backups/status` | poslední zálohy (pro Nastavení) |
| POST | `/api/backups/run` | ruční záloha (admin) |
| GET  | `/api/export` | ZIP: data.json + photos/ (docs/EXPORT-FORMAT.md) |
| POST | `/api/import` | obnovení/import s náhledem a kontrolou integrity (admin) |

## Sync (Fáze 10) — detail v SYNC.md

| Metoda | Cesta | Popis |
|---|---|---|
| GET  | `/api/sync/pull?cursor=&limit=` | změny z change_log od kurzoru |
| POST | `/api/sync/push` | dávka operací z outboxu (idempotentní dle opId) |

## Ostatní

| Metoda | Cesta | Popis |
|---|---|---|
| GET | `/api/health` | liveness + kontrola DB spojení |
