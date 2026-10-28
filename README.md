# Naše domácnost

Rodinná aplikace pro jednu domácnost: kuchařka s nutričními hodnotami,
jídelníček, nákupní seznamy, úkoly a úklid, kalendář a osobní výživový deník.
Běží na vlastním Raspberry Pi, dostupná jen přes Tailscale, funguje i offline.

Není to produkt pro veřejnost — je to domácí server pro jednu rodinu (D-004).

## Co to umí

- **Kuchařka** — otevírá se na kapitolách jako tištěná kniha (pořadí si určíš,
  nepotřebné kapitoly schováš); recepty s fotkami, skupinami ingrediencí, kroky
  a přípravou předem; hledání bez diakritiky, které toleruje překlepy
  i skloňování („cocka" najde „čočky"), filtry podle kategorií, štítků, času,
  obtížnosti a skupin potravin; přepočet porcí s lidským zaokrouhlením; režim
  vaření (krok na obrazovku, obrazovka nezhasne).
- **Nutriční hodnoty** — katalog 228 potravin, převody jednotek, které nikdy
  nehádají, přepis hodnot v rámci receptu, dopočet na cílovou hodnotu,
  čárové kódy a Open Food Facts.
- **Jídelníček a kalendář** — týdenní plán, opakované události, návrhy
  přípravy předem.
- **Nákup** — položky z receptu i celého jídelníčku, slučování jen při
  jednoznačném převodu, řazení podle sekcí obchodu, rychlé odškrtávání.
- **Úkoly a úklid** — šablony s intervaly, průvodce úklidem, hromadné
  přiřazování, návrhy „je čas znovu" s rozprostřením zátěže.
- **Deník** — osobní, per uživatel, s neměnným snapshotem hodnot, denními
  součty, týdenními grafy a volitelnými cíli.
- **Sdílení** — recepty konkrétním lidem ke čtení nebo úpravám, kopírování
  včetně fotek, veřejné odkazy (za přepínačem, výchozí stav vypnuto).
- **PDF kuchařka**, **export/import ZIP** a **denní zálohy** se sidecarem.
- **Offline** — kuchařka, nákup, úkoly a deník se čtou z lokálního zrcadla,
  odškrtnutí a splnění čekají ve frontě a odešlou se po připojení.

## Rychlý start (vývoj)

```bash
docker compose up -d db backup
pnpm install
cp .env.example .env
pnpm db:migrate
pnpm db:seed      # testovací účty, jen do prázdné databáze
pnpm dev          # http://localhost:3000
```

Testovací přihlášení: `vojta@test.local` / `heslo123` (správce),
`eliska@test.local` / `heslo123` (člen).

Produkční build nikdy nespouštěj proti běžícímu dev serveru bez
`NEXT_DIST_DIR=.next-prod` — přepsal by mu `.next`.

## Kontroly

```bash
pnpm lint && pnpm typecheck && pnpm test    # 158 jednotkových testů
pnpm test:e2e                                # Playwright smoke (potřebuje běžící app)
```

`pnpm test:e2e` jede proti `E2E_BASE_URL` (výchozí `http://localhost:3000`)
a proti naseedované domácnosti.

## Nasazení

Raspberry Pi 5, Docker, Tailscale — celý postup včetně obnovy ze zálohy je
v [docs/DEPLOY.md](docs/DEPLOY.md).

## Dokumentace

| Soubor | O čem to je |
| --- | --- |
| [PROGRESS.md](PROGRESS.md) | stav projektu, checklist všech fází, známé problémy |
| [docs/DECISIONS.md](docs/DECISIONS.md) | proč je co tak, jak to je (D-001 … D-027) |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | autentizace, oprávnění, fotky, zálohy |
| [docs/DATA-MODEL.md](docs/DATA-MODEL.md) | tabulky a vztahy |
| [docs/API.md](docs/API.md) | endpointy |
| [docs/SYNC.md](docs/SYNC.md) | offline protokol, konflikty, rozsah synchronizace |
| [docs/DESIGN.md](docs/DESIGN.md) | vizuální identita, tokeny, mobilní layout |
| [docs/IMPORT-RECIPES.md](docs/IMPORT-RECIPES.md) | formát pro import receptů (+ prompt pro AI) |
| [docs/EXPORT-FORMAT.md](docs/EXPORT-FORMAT.md) | formát zálohovacího ZIPu |
| [docs/DEPLOY.md](docs/DEPLOY.md) | nasazení, aktualizace, obnova |

## Technologie

Next.js 15 (App Router) · TypeScript · Tailwind v4 · Drizzle + Postgres 16 ·
TanStack Query · Dexie (offline zrcadlo) · Serwist (service worker) ·
sharp · @react-pdf/renderer · Vitest + Playwright.
