# Architektonická rozhodnutí

Každé rozhodnutí: co, proč, jaké byly alternativy. Nejnovější nahoře.

---

## D-002 — Repozitář založen přímo v adresáři „Nase Domacnost" (2026-08-13)

**Co:** Git repozitář je kořen pracovního adresáře `C:\Users\Jokil\Nase Domacnost`, výchozí větev `master`.
**Proč:** Adresář byl prázdný a název odpovídá projektu; vnořený podadresář by jen přidal úroveň.
**Alternativy:** Podadresář `app/` uvnitř — zavrženo, žádný jiný obsah tu není.

## D-001 — Struktura fáze 0 dle master promptu (2026-08-13)

**Co:** Krok 0.11 (repo + PROGRESS.md + DECISIONS.md) proveden jako první, před otázkami z 0.1, přesně dle sekce 14 zadání. Checklist všech 12 fází je v PROGRESS.md.
**Proč:** Aby od začátku existovalo místo, kam zapisovat stav a rozhodnutí — ochrana proti přerušení session.
**Alternativy:** Žádné relevantní.
