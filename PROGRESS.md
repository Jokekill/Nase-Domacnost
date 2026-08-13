# STAV PROJEKTU

**Poslední aktualizace:** 2026-08-13 (pozdě v noci)
**Aktuální fáze:** Fáze 2 — Kuchařka (hotová až na 2.9 přepočet porcí)
**Právě rozpracováno:** 2.9 přepočet porcí — návrh zaokrouhlování poslán Vojtovi ke schválení (zadání §6/§13 vyžaduje souhlas před implementací)
**Další krok:** po schválení implementovat 2.9 (lib + testy + UI na detailu receptu), pak akceptace 2.13 a Fáze 3

## Jak projekt spustit

```bash
docker compose up -d db
pnpm install
pnpm db:migrate
pnpm db:seed        # volitelné: testovací účty (jen do prázdné DB)
pnpm dev            # http://localhost:3000
```

Testovací přihlášení: vojta@test.local / heslo123 (admin), eliska@test.local / heslo123 (člen).
Pozn.: dev prostředí na tomto stroji má Node 22 + pnpm 10 (instalováno přes winget) a Docker Desktop (starší, 20.10 — funguje).

## Známé problémy / TODO

- [ ] `pnpm build` lokálně na Windows běží bez `output: 'standalone'` (symlink EPERM); Docker build nastaví `BUILD_STANDALONE=1` — viz next.config.ts
- [ ] HEIC upload fotek — ověřit podporu sharp/libheif v Docker buildu (Fáze 2)
- [ ] SMTP pro reset hesla zatím chybí — odkaz se loguje do konzole serveru (záměr, viz ARCHITECTURE.md §1.3)
- [ ] CI workflow (.github/workflows/ci.yml) je připravený, ale repo nemá GitHub remote — aktivuje se až po pushnutí

## Rozhodnutí, která čekají na Vojtu

- [ ] Odsouhlasení Fáze 1 (akceptace splněna: registrace, přihlášení, domácnost, pozvánka, ověřeno v prohlížeči)

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
- [ ] 0.8 Návrh sync protokolu → docs/SYNC.md — návrh hotov 2026-08-13, ČEKÁ NA ODSOUHLASENÍ
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
- [ ] 2.9 Přepočet porcí — NÁVRH ČEKÁ NA SCHVÁLENÍ (zadání §6.2 + §13), pak implementace s testy
- [x] 2.10 Režim vaření: krok na obrazovku, ingredience jako krok 0, Wake Lock s re-acquire — hotovo 2026-08-13
- [x] 2.11 Vyhledávání: bez diakritiky, word_similarity (skloňování: „cocka" najde „čočky"), tsvector, hledá i v ingrediencích — ověřeno 2026-08-13
- [x] 2.12 Filtry: kategorie (vč. podstromu), tagy, čas, obtížnost, skupina potravin obsahuje/neobsahuje; čipy aktivních filtrů — hotovo 2026-08-13 (mobilní bottom-sheet varianta odložena, panel je responzivní)
- [ ] 2.13 Akceptace Fáze 2 — zbývá přepočet porcí (2.9); hledání dle názvu/ingredience/skupiny ověřeno API testy, recept s fotkou vytvořen přes UI

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
