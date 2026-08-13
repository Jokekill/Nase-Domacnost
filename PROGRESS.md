# STAV PROJEKTU

**Poslední aktualizace:** 2026-08-13 (odpoledne)
**Aktuální fáze:** Fáze 0 — Analýza a návrh
**Právě rozpracováno:** 0.2 Návrh datového modelu — návrh v docs/DATA-MODEL.md, čeká na odsouhlasení Vojtou
**Další krok:** 0.3 Návrh API (po odsouhlasení datového modelu)

## Jak projekt spustit

Zatím není co spouštět — projekt je ve fázi návrhu (žádný aplikační kód).

## Známé problémy / TODO

- [ ] Zatím žádné.

## Rozhodnutí, která čekají na Vojtu

- [ ] Odsouhlasení návrhu datového modelu (docs/DATA-MODEL.md)

---

# CHECKLIST

## Fáze 0 — Analýza a návrh (žádný aplikační kód)

- [x] 0.11 Založení repozitáře, PROGRESS.md, docs/DECISIONS.md, kompletní checklist — hotovo 2026-08-13 *(uděláno jako první krok dle zadání)*
- [x] 0.1 Analýza požadavků, seznam nejasností a otázek — hotovo 2026-08-13, odpovědi zapsány v docs/DECISIONS.md (D-003)
- [x] 0.9 Seznam nejrizikovějších částí a plán řešení — odesláno 2026-08-13 spolu s otázkami
- [ ] 0.2 Návrh datového modelu → docs/DATA-MODEL.md — návrh hotov 2026-08-13, ČEKÁ NA ODSOUHLASENÍ
- [ ] 0.3 Návrh API → docs/API.md
- [ ] 0.4 Návrh systému oprávnění
- [ ] 0.5 Návrh ukládání fotek
- [ ] 0.6 Návrh zálohování
- [ ] 0.7 Návrh autentizace
- [ ] 0.8 Návrh sync protokolu pro offline → docs/SYNC.md
- [ ] 0.10 Vizuální identita → docs/DESIGN.md

## Fáze 1 — Základ

- [ ] 1.1 Docker Compose (app + postgres), volume pro data
- [ ] 1.2 Next.js 15 skeleton (App Router, TypeScript strict, `output: 'standalone'`), pnpm, ESLint, Prettier
- [ ] 1.3 Tailwind CSS v4 + shadcn/ui, základní design tokens dle docs/DESIGN.md
- [ ] 1.4 Drizzle ORM + drizzle-kit, první migrace (users, sessions, households, household_members, household_invites, change_log + triggery)
- [ ] 1.5 DB rozšíření: unaccent, pg_trgm, uuid-ossp
- [ ] 1.6 Autentizace: registrace, přihlášení, odhlášení, serverové session, argon2id
- [ ] 1.7 Domácnost: vytvoření, pozvánky přes jednorázový token, role admin/member
- [ ] 1.8 Reset hesla přes token (e-mail zatím log do konzole)
- [ ] 1.9 Základní layout a navigace (mobilní spodní lišta, desktop navigace)
- [ ] 1.10 Health-check endpoint
- [ ] 1.11 CI kontrola buildu (pnpm build)
- [ ] 1.12 Akceptace Fáze 1: běží v Dockeru, registrace, přihlášení, domácnost, pozvánka druhého člena

## Fáze 2 — Kuchařka (nejdůležitější fáze)

- [ ] 2.1 Schéma a migrace: recipes, recipe_photos, recipe_steps, recipe_ingredients, recipe_ingredient_groups, categories (hierarchie), recipe_categories, tags, recipe_tags, recipe_prep_ahead
- [ ] 2.2 CRUD receptů — API + validace Zodem
- [ ] 2.3 Upload fotografií, sharp varianty (thumb/card/full, WebP), autentizovaný servírovací endpoint, EXIF orientace
- [ ] 2.4 Editor receptu: základní údaje, strukturované ingredience se skupinami, postup po krocích
- [ ] 2.5 Hierarchické kategorie — správa stromu, přiřazování receptů
- [ ] 2.6 Tagy
- [ ] 2.7 Přehled kuchařky — karty s fotkou, mřížka desktop / 1–2 sloupce mobil
- [ ] 2.8 Detail receptu
- [ ] 2.9 Přepočet porcí s „lidským" zaokrouhlováním (+ testy)
- [ ] 2.10 Režim vaření (velké písmo, krok za krokem, Wake Lock)
- [ ] 2.11 Vyhledávání: fulltext bez diakritiky + pg_trgm fuzzy, search_normalized sloupce + GIN indexy
- [ ] 2.12 Filtry: kategorie, tagy, čas, obtížnost, ingredience (obsahuje/neobsahuje), skupiny ingrediencí; UI s čipy + mobilní sheet
- [ ] 2.13 Akceptace Fáze 2: reálný recept s fotkami, nalezení bez diakritiky, podle ingredience i skupiny, přepočet porcí

## Fáze 3 — Nutriční systém

- [ ] 3.1 Schéma: foods, food_categories (hierarchie), food_units, nutriční sloupce, reference_unit, density_g_per_ml, grams_per_piece
- [ ] 3.2 Seed ~200 českých potravin (seeds/foods.json) + strom food_categories
- [ ] 3.3 Správa potravin a jednotek v UI
- [ ] 3.4 Převody jednotek (g↔ml přes hustotu, ks↔g, lžíce/lžička přes food_units) + testy
- [ ] 3.5 Výpočet nutričních hodnot receptu a porce, viditelné upozornění na nekompletnost + testy
- [ ] 3.6 nutrition_override na ingredienci (UI indikace, návrat k DB hodnotě)
- [ ] 3.7 Open Food Facts: hledání podle názvu, rate limit, User-Agent, cache
- [ ] 3.8 Čárové kódy: BarcodeDetector + fallback zxing-js
- [ ] 3.9 Reverzní výpočet se zamykáním ingrediencí + varování + testy
- [ ] 3.10 Specifikace importního formátu receptů → docs/IMPORT-RECIPES.md (Vojta převede PDF recepty přes AI do tohoto formátu; spec napsat co nejdřív, ať může začít)
- [ ] 3.11 Import receptů z JSON souboru (validace, náhled, hlášení chyb)
- [ ] 3.12 Akceptace Fáze 3: správné hodnoty na porci, reverzní výpočet funguje a varuje, testy prochází

## Fáze 4 — Jídelníček a kalendář

- [ ] 4.1 Schéma: meal_types (konfigurovatelné), meal_plan_entries, calendar_events
- [ ] 4.2 Týdenní plán jídelníčku — recept i volný text, počet porcí, kdo připravuje
- [ ] 4.3 Měsíční kalendář + týdenní detailní pohled
- [ ] 4.4 Zobrazení úkolů s obdobím (pruh přes období) v kalendáři
- [ ] 4.5 Příprava předem: recipe_prep_ahead → návrhy úkolů (přijmout/upravit/odmítnout, odmítnuté se neopakují)

## Fáze 5 — Nákup

- [ ] 5.1 Schéma: shopping_lists (období od–do), shopping_items, shopping_item_sources
- [ ] 5.2 Ruční položky, import z receptu, import z jídelníčku
- [ ] 5.3 Slučování podle food_id, jednoznačné převody jednotek, zobrazení zdrojů + testy
- [ ] 5.4 Řazení podle kategorií obchodu
- [ ] 5.5 Rychlé odškrtávání (optimistické UI)

## Fáze 6 — Úkoly a úklid

- [ ] 6.1 Schéma: task_lists, task_templates, template_groups, tasks, task_assignees, task_completion_history
- [ ] 6.2 Obecné seznamy úkolů, CRUD
- [ ] 6.3 Šablony a skupiny šablon, intervaly opakování včetně vlastního
- [ ] 6.4 Vytvoření konkrétního úklidu: období → výběr ze šablon → vlastní úkoly → přiřazení
- [ ] 6.5 Hromadné přiřazování po osobách
- [ ] 6.6 Moje úkoly / Ostatní úkoly, odškrtnutí cizího úkolu se záznamem, kdo splnil
- [ ] 6.7 Historie splnění, návrhy občasných úkolů, algoritmus rozprostření zátěže

## Fáze 7 — Výživový deník

- [ ] 7.1 Schéma: diary_entries se snapshot nutričních hodnot
- [ ] 7.2 Zápis: z receptu (individuální porce), z potraviny, ruční hodnoty
- [ ] 7.3 Přenos z jídelníčku jedním klikem (nikdy automaticky)
- [ ] 7.4 Denní přehled (kJ, kcal, bílkoviny, sacharidy, cukry, vláknina, tuky)
- [ ] 7.5 Týdenní průměry + grafy
- [ ] 7.6 Volitelné osobní cíle a plnění

## Fáze 8 — Sdílení

- [ ] 8.1 Schéma: recipe_shares, recipe_public_links, recipes.visibility, copied_from_recipe_id
- [ ] 8.2 Vynucení oprávnění na úrovni API (recept vs. data domácnosti)
- [ ] 8.3 Sdílení konkrétním uživatelům (view/edit)
- [ ] 8.4 Kopírování receptu včetně fotek, „převzato od …"
- [ ] 8.5 Veřejné odkazy /share/<token> za feature flagem PUBLIC_SHARING_ENABLED

## Fáze 9 — PDF a zálohy

- [ ] 9.1 PDF kuchařka přes @react-pdf/renderer, fonty s diakritikou, bez nutričních hodnot
- [ ] 9.2 Automatická denní záloha (pg_dump + uploads), retence 7/4/12
- [ ] 9.3 Ruční záloha tlačítkem, stav poslední zálohy v Nastavení
- [ ] 9.4 Export ZIP (data.json + photos/) + docs/EXPORT-FORMAT.md
- [ ] 9.5 Import / obnovení s kontrolou integrity a náhledem

## Fáze 10 — Offline a PWA

- [ ] 10.1 Návrh docs/SYNC.md odsouhlasen (z Fáze 0.8), finalizace detailů
- [ ] 10.2 @serwist/next service worker, manifest, instalace na plochu
- [ ] 10.3 Dexie lokální mirror + outbox
- [ ] 10.4 GET /api/sync/pull (kurzor podle change_log.seq)
- [ ] 10.5 POST /api/sync/push (idempotence podle op_id)
- [ ] 10.6 Konflikty: field-level LWW, odškrtnutí vyhrává, notifikace o zahozené změně + testy
- [ ] 10.7 Cache fotek (thumb/card naposledy zobrazených), fotky v outboxu
- [ ] 10.8 Indikace stavu synchronizace v UI
- [ ] 10.9 Ověření offline scénářů dle priority 7.2

## Fáze 11 — Doladění

- [ ] 11.1 Výkon: indexy, N+1, velikost bundle
- [ ] 11.2 Přístupnost
- [ ] 11.3 Doplnění testů (Vitest povinné oblasti, Playwright smoke)
- [ ] 11.4 Multi-arch build (buildx, amd64+arm64), docs/DEPLOY.md
- [ ] 11.5 Nasazení na Raspberry Pi 5 + Tailscale
- [ ] 11.6 Ověření obnovy ze zálohy na čisté instalaci
- [ ] 11.7 Finální dokumentace
