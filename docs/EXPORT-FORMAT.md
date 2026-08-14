# Formát exportu (ZIP)

**Stav:** implementováno ve Fázi 9, `formatVersion: 1`, 2026-08-14.

Export vytváří `GET /api/export` (jen správce), import čte `POST /api/import`.
Cíl: obnova na čisté instalaci = `docker compose up` + import tohoto ZIPu
(ověřuje se v kroku 11.6).

---

## 1. Struktura archivu

```
nase-domacnost-export-2026-08-14.zip
├── data.json
└── photos/
    └── <household_id>/<yyyy>/<mm>/<uuid>_orig.jpg
        <household_id>/<yyyy>/<mm>/<uuid>_thumb.webp
        <household_id>/<yyyy>/<mm>/<uuid>_card.webp
        <household_id>/<yyyy>/<mm>/<uuid>_full.webp
```

Cesty v `photos/` odpovídají `recipe_photos.storage_key` + přípona varianty,
takže obnova je prosté rozbalení do `UPLOADS_DIR`. Exportují se **všechny
varianty**, aby obnova nemusela znovu spouštět `sharp`.

## 2. data.json

```jsonc
{
  "formatVersion": 1,
  "exportedAt": "2026-08-14T08:12:33.001Z",
  "app": "Naše domácnost",
  "includesCredentials": true,   // byly zahrnuty hashe hesel?
  "includesPhotos": true,
  "tables": {
    "users": [ { "id": "…", "email": "…", "displayName": "…", … } ],
    "households": [ … ],
    "recipes": [ … ]
    // … viz pořadí níže
  }
}
```

- Klíče sloupců jsou **camelCase** (tak, jak je vrací aplikace), hodnoty jsou
  JSON: čísla jako čísla, časy jako ISO 8601 řetězce, `jsonb` jako vnořený
  objekt.
- Pole `tables` obsahuje celé tabulky, ne diff. Chybějící tabulka = žádné
  řádky (import ji přeskočí, ne že smaže).

### Pořadí tabulek

Import vkládá v tomto pořadí a je závazné — potomek smí vzniknout až po
rodiči (`src/lib/transfer/tables.ts` je jediný zdroj pravdy):

```
users, households, household_members,
store_sections, food_categories, food_category_closure, foods, food_units,
categories, category_closure, tags,
recipes, recipe_photos, recipe_ingredient_groups, recipe_ingredients,
recipe_steps, recipe_step_ingredients, recipe_categories, recipe_tags,
recipe_prep_ahead, recipe_shares, recipe_public_links,
meal_types, meal_plan_entries, calendar_events, calendar_event_overrides,
task_lists, template_groups, task_templates, tasks, task_assignees,
task_completion_history, prep_task_suggestions,
shopping_lists, shopping_items, shopping_item_sources,
diary_entries, nutrition_goals
```

### Co se záměrně neexportuje

| Tabulka | Proč |
|---|---|
| `sessions`, `password_reset_tokens`, `household_invites` | krátkodobé tokeny, po obnově nemají smysl a jsou to citlivé údaje |
| `change_log` | kurzor synchronizace konkrétní instalace |
| `off_cache` | cache Open Food Facts, natáhne se znovu |
| `backup_runs` | historie záloh toho konkrétního stroje |

## 3. Hesla a citlivost

Při zaškrtnutém „včetně přihlašovacích údajů" obsahuje `users.passwordHash`
**argon2id hashe** — bez nich by po obnově nikdo neměl jak se přihlásit.
Soubor je proto nutné chránit jako heslo samotné. Bez tohoto přepínače se
uživatelé exportují bez hashů a po obnově je nutné hesla znovu nastavit.

Export navíc obsahuje **osobní deníky všech členů** (`diary_entries`,
`nutrition_goals`) — proto je endpoint dostupný jen správci domácnosti.

## 4. Import

Dvoufázový (`mode=preview` → `mode=apply`):

1. **Náhled** ověří formát, spočítá záznamy a zkontroluje integritu:
   - každý odkaz (`recipe_ingredients.recipeId`, `tasks.taskListId`, …) musí
     mířit na řádek, který je buď v souboru, nebo už v databázi,
   - každý řádek `recipe_photos` musí mít v archivu svůj `_orig` soubor,
   - `formatVersion` musí sedět.
   Náhled se **nedotýká databáze**.
2. **Zápis** proběhne v jedné transakci. Řádky, jejichž `id` už v databázi
   existuje, se **přeskočí** — import nikdy nepřepisuje novější data. Fotky se
   zapisují až po úspěšném commitu, cesty se hlídají proti úniku mimo
   `UPLOADS_DIR`.

Výsledek hlásí počty vložených a přeskočených záznamů po tabulkách.

## 5. Verzování

`formatVersion` roste při nekompatibilní změně (přejmenování/odebrání sloupce).
Import cizí verzi odmítne s jasnou hláškou místo tichého poškození dat.
