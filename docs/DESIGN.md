# Vizuální identita

**Stav:** návrh (krok 0.10), 2026-08-13. Tokeny se přenesou do Tailwind v4
(`@theme`) ve Fázi 1; světlý i tmavý režim od začátku (D-003/10).

## 1. Charakter

Domácí kuchařka, ne administrativní systém. Teplý papír, hodně fotek, serif
na nadpisech receptů, velkorysý prostor. Tmavý režim není „inverze", ale
„večerní kuchyň" — teplé tmavé tóny, žádná studená čerň.

## 2. Paleta

| Token | Světlý | Tmavý | Použití |
|---|---|---|---|
| `--background` | `#FAF6EF` (krémový papír) | `#201B16` | plocha stránky |
| `--surface` | `#FFFFFF` | `#2A241E` | karty, panely |
| `--surface-warm` | `#F3ECDF` | `#332C24` | zvýrazněné sekce, hover |
| `--foreground` | `#2D2620` (teplá tmavá) | `#F0E9DE` | základní text |
| `--muted-foreground` | `#7A7064` | `#A89C8C` | popisky, metadata |
| `--primary` | `#C2571B` (terakota) | `#E07A3E` | akce, aktivní stavy, odkazy |
| `--primary-foreground` | `#FFF8F2` | `#241505` | text na primary |
| `--accent-green` | `#5A7052` (šalvěj) | `#8FA983` | úspěch, „hotovo", čerstvost |
| `--destructive` | `#A63A2B` | `#D06A5A` | mazání, chyby |
| `--border` | `#E5DCCC` | `#3D352C` | linky, ohraničení |
| `--ring` | `--primary` | `--primary` | focus |

Sémantické aliasy (`--success`, `--warning #B07A26/#D9A44E`) doplníme dle
potřeby. Kontrast textů ověřit na AA (4.5:1) — terakota na krému funguje jen
pro velké prvky, na běžný text vždy `--foreground`.

## 3. Typografie

- **Nadpisy receptů a sekcí: „Fraunces"** (variabilní serif, plná čeština,
  SIL OFL — lze self-hostovat i vložit do PDF). Váhy 500–700, optická osa
  „soft" pro domácký charakter.
- **UI a text: „Inter"** (variabilní, čeština, OFL). 400/500/600.
- Fonty **self-hostované** v repu (`/public/fonts`, `next/font/local`) —
  žádný Google Fonts CDN (soukromí + offline + Tailscale).
- Stejné soubory se registrují v `@react-pdf/renderer` (Fáze 9) — jedna sada
  fontů pro web i PDF.
- Škála: 14 px base UI, recepty čtou větší (16–18 px), režim vaření 22 px+.

## 4. Tvary, stíny, pohyb

- Rádiusy: `--radius: 12px` karty a inputy, 8 px menší prvky, fotky karet
  12 px. Měkké, ne pilulkové.
- Stíny: nízké a teplé — `0 1px 3px rgb(45 38 32 / 0.08)` karty,
  `0 8px 24px rgb(45 38 32 / 0.12)` vyskakovací prvky. Ve tmavém režimu
  stíny slabší + jemný světlejší border.
- Animace: krátké (150–200 ms), jen opacity/transform. Odškrtnutí položky
  má drobnou „satisfying" odezvu (přeškrtnutí + zeslabení).

## 5. Komponentní zásady

- **shadcn/ui** jako základ, přebarvený tokeny výše; komponenty se
  kopírují do repa (žádná runtime závislost).
- Karta receptu: fotka 4:3 nahoře (fallback: teplý placeholder s ikonou
  vařečky), serif název, řádek metadat (porce · čas · obtížnost ikonami).
- Dotykové cíle min 44 px; checkboxy nákupu/úkolů 28 px vizuálně, 44 px
  hit-area.
- Mobil: spodní lišta 5 položek — **📖 Kuchařka (první)** · Jídelníček ·
  Nákup · Úkoly · Více (kalendář, deník, nastavení). Desktop: horní lišta
  se všemi moduly, kuchařka zvýrazněná.
- Prázdné stavy vždy s ilustrací/ikonou a akcí („Zatím žádné recepty →
  Přidat první recept").

## 6. Režimy

- Přepínač světlý / tmavý / podle systému v Nastavení (ukládá se do
  `users.preferences.theme`, aplikuje se přes `class` na `<html>`,
  bez FOUC — inline skript čte localStorage).
- Režim vaření: maximální kontrast, 22 px+ text, krok na obrazovku,
  Wake Lock, velká tlačítka další/předchozí.
