# Importní formát receptů

Tenhle dokument je návod, jak převést existující recepty (z PDF, dokumentů,
poznámek) do souboru, který aplikace naimportuje. Formát je navržený tak, aby
ho zvládla spolehlivě vygenerovat AI z volného textu.

**Kam to nahrát:** Nastavení → Potraviny → *(import receptů přijde jako
tlačítko v Kuchařce)* — endpoint `POST /api/recipes/import`.

---

## 1. Základní tvar souboru

Jeden soubor JSON, kódování **UTF-8**, přípona `.json`:

```json
{
  "formatVersion": 1,
  "recipes": [
    { "...recept 1..." },
    { "...recept 2..." }
  ]
}
```

V jednom souboru může být libovolný počet receptů (doporučeno max 200 na dávku).

---

## 2. Recept — všechna pole

```json
{
  "title": "Babiččina bábovka",
  "intro": "Klasická mramorová bábovka, jak ji pekla babička.",
  "baseServings": 12,
  "prepTimeMin": 20,
  "cookTimeMin": 55,
  "difficulty": "easy",
  "source": "Rodinný sešit, str. 14",
  "notes": "Nejlepší je druhý den.",
  "categories": ["Dezerty a sladké", "Koláče a buchty"],
  "tags": ["oblíbené", "nedělní"],
  "prepAhead": {
    "leadTimeHours": 12,
    "description": "Vyndat máslo a vejce, aby byly pokojové teploty"
  },
  "ingredientGroups": ["Těsto", "Poleva"],
  "ingredients": [
    {
      "name": "Pšeničná mouka hladká",
      "amount": 300,
      "unit": "g",
      "group": "Těsto",
      "note": "prosátá",
      "optional": false
    },
    { "name": "Vejce slepičí", "amount": 4, "unit": "ks", "group": "Těsto" },
    { "name": "špetka soli", "amount": null, "unit": null, "group": "Těsto" }
  ],
  "steps": [
    "Máslo utři s cukrem do pěny.",
    "Postupně zašlehej vejce.",
    "Peč 55 minut při 175 °C."
  ]
}
```

### Povinná pole

| Pole | Typ | Poznámka |
|---|---|---|
| `title` | text | název receptu |
| `baseServings` | celé číslo | počet porcí, ke kterému se vztahují množství |
| `ingredients` | pole | může být prázdné, ale musí existovat |
| `steps` | pole textů | jednotlivé kroky postupu, **ne jeden odstavec** |

### Volitelná pole

| Pole | Typ | Poznámka |
|---|---|---|
| `intro` | text | krátký úvod |
| `prepTimeMin` / `cookTimeMin` | číslo | minuty; celkový čas se dopočítá |
| `difficulty` | `"easy"` / `"medium"` / `"hard"` | |
| `source` | text | odkud recept je |
| `notes` | text | poznámky pod receptem |
| `categories` | pole textů | názvy kategorií, viz §4 |
| `tags` | pole textů | vytvoří se, pokud neexistují |
| `prepAhead` | objekt | příprava předem (`leadTimeHours`, `description`) |
| `ingredientGroups` | pole textů | pořadí skupin ingrediencí |

---

## 3. Ingredience — na tom nejvíc záleží

```json
{
  "name": "Pšeničná mouka hladká",
  "amount": 300,
  "unit": "g",
  "group": "Těsto",
  "note": "prosátá",
  "optional": false
}
```

- **`name`** — název suroviny. Import ho **spáruje s databází potravin**
  (bez ohledu na diakritiku a velikost písmen, s tolerancí překlepů). Když se
  potravina najde, recept z ní bude umět počítat nutriční hodnoty a půjde
  hledat podle skupin („luštěniny“). Když se nenajde, uloží se jako **volný
  text** — recept funguje dál, jen nemá výživové údaje pro tuhle položku.
- **`amount`** — číslo, desetinná tečka (`0.5`), nebo `null`.
- **`unit`** — jedna z: `g`, `kg`, `ml`, `l`, `ks`, `lzicka`, `lzice`,
  `spetka`, `dle_chuti`. Jiná hodnota = chyba importu.
- **`note`** — úprava suroviny („nahrubo nasekaná“, „pokojové teploty“).
  Nepatří sem množství.
- **`group`** — název skupiny; musí být i v `ingredientGroups`.
- **`optional`** — `true` u nepovinných surovin.

### Jak přepsat běžné zápisy

| V receptu stojí | `name` | `amount` | `unit` | `note` |
|---|---|---|---|---|
| 300 g hladké mouky | `Pšeničná mouka hladká` | 300 | `g` | |
| 1/2 l mléka | `Mléko plnotučné 3,5 %` | 0.5 | `l` | |
| 2 lžíce oleje | `Slunečnicový olej` | 2 | `lzice` | |
| špetka soli | `Sůl kuchyňská` | 1 | `spetka` | |
| sůl dle chuti | `Sůl kuchyňská` | null | `dle_chuti` | |
| 3 vejce | `Vejce slepičí` | 3 | `ks` | |
| 1 velká cibule, nadrobno | `Cibule žlutá` | 1 | `ks` | `velká, nadrobno` |
| 2 stroužky česneku | `Česnek (stroužek)` | 2 | `ks` | |
| hrst petrželky | `Petrželová nať` | null | `dle_chuti` | `hrst` |

**Pravidla:**
1. Zlomky převeď na desetinná čísla (`1/2` → `0.5`, `1½` → `1.5`).
2. Rozsahy zapiš jako spodní hranici a rozsah dej do `note`
   (`2–3 lžíce` → `amount: 2`, `note: "2–3 lžíce"`).
3. Nikdy nedopočítávej gramy z kusů ani naopak — to udělá aplikace, pokud má
   převod k dispozici. **Radši prázdné než odhadnuté.**
4. Když nevíš množství, dej `amount: null` a `unit: null`.
5. Jednu položku nerozděluj na víc ingrediencí.

---

## 4. Kategorie

`categories` je pole názvů. Import je hledá mezi existujícími kategoriemi
receptů (bez ohledu na diakritiku). Co se nenajde, **vytvoří se jako nová
kategorie na nejvyšší úrovni** — hierarchii si pak snadno srovnáš v aplikaci.

Základní kategorie, které v aplikaci už jsou:

> Předkrmy · Polévky · Hlavní jídla (Masitá, Bezmasá, Těstoviny, Luštěninová) ·
> Přílohy · Saláty · Pečivo a chléb · Dezerty a sladké (Koláče a buchty,
> Sušenky a cukroví) · Snídaně · Omáčky a dipy · Nápoje · Zavařování a nakládání

---

## 5. Co import udělá a co ne

**Udělá:**
- založí recepty jako nové (nikdy nepřepisuje existující),
- spáruje ingredience s databází potravin,
- vytvoří chybějící tagy a kategorie,
- ukáže **náhled** — kolik receptů, kolik ingrediencí se spárovalo a co ne —
  a teprve po potvrzení uloží.

**Neudělá:**
- nepřidá fotky (ty se nahrávají v aplikaci),
- nevymyslí chybějící údaje,
- nespojí duplicitní recepty — když soubor nahraješ dvakrát, vzniknou dvakrát.

---

## 6. Prompt pro AI (můžeš použít doslova)

> Převeď následující recepty do JSON podle tohoto formátu. Dodrž přesně
> strukturu, klíče anglicky, obsah česky.
>
> ```json
> {
>   "formatVersion": 1,
>   "recipes": [
>     {
>       "title": "…",
>       "intro": "…",
>       "baseServings": 4,
>       "prepTimeMin": null,
>       "cookTimeMin": null,
>       "difficulty": null,
>       "source": null,
>       "notes": null,
>       "categories": [],
>       "tags": [],
>       "ingredientGroups": [],
>       "ingredients": [
>         { "name": "…", "amount": 300, "unit": "g", "group": null, "note": null, "optional": false }
>       ],
>       "steps": ["…", "…"]
>     }
>   ]
> }
> ```
>
> Pravidla:
> - `unit` smí být jen: g, kg, ml, l, ks, lzicka, lzice, spetka, dle_chuti.
> - Zlomky převeď na desetinná čísla. Rozsahy → spodní hranice + poznámka.
> - Nepřeváděj jednotky (kusy nepřepočítávej na gramy).
> - Do `name` dej jen název suroviny, úpravu („nasekaná“) dej do `note`.
> - Postup rozděl na jednotlivé kroky do pole `steps`, nedávej vše do jednoho.
> - Co v receptu není, nech `null` nebo prázdné pole. Nic si nevymýšlej.
> - Vrať pouze platný JSON, nic jiného.

---

## 7. Kontrola před nahráním

- Je soubor platný JSON? (Zkus ho otevřít v prohlížeči — pokud se zobrazí
  strom, je v pořádku.)
- Má každý recept `title`, `baseServings`, `ingredients` a `steps`?
- Používají všechny ingredience jen povolené jednotky?

Import ti stejně nejdřív ukáže náhled a případné chyby vypíše i s číslem
receptu, takže se nedá nic pokazit.
