# Offline synchronizace — návrh protokolu

**Stav:** odsouhlaseno (D-011), implementováno ve Fázi 10, 2026-08-14.

Odchylky od původního návrhu, na které se přišlo při implementaci:

- **Bootstrap má vlastní tvar odpovědi.** `GET /api/sync/pull?bootstrap=true`
  vrací rovnou `{ tables: {…}, cursor }` místo proudu změn — první sync tak
  neprochází celý `change_log` (klidně 500 záznamů na 250 potravin).
- **Push umí zatím jen tři entity** (`shopping_items`, `tasks`,
  `diary_entries`) a u nich jen vyjmenovaná pole (`writableFields`
  v `src/lib/sync/registry.ts`). Cokoli dalšího se odmítne jako
  `entity_not_writable_offline`. Offline zakládání receptů (priorita 5) tím
  zatím není pokryté.
- **Kdo odškrtl, určuje server**, ne payload: `checked_by` / `completed_by` se
  dosazují ze session, jinak by si klient mohl přiřknout cizí identitu.
- **Prošlý kurzor vrací 409**, ne 410 — chybové kódy aplikace mapuje
  `ApiError('conflict')`; význam (re-bootstrap) je stejný.

---

## 1. Přehled architektury

```
┌─ prohlížeč ──────────────────────────────┐      ┌─ server ────────────────┐
│ React + TanStack Query                   │      │ Next.js API             │
│        │                                 │      │   │                     │
│ Dexie (IndexedDB)                        │      │ Postgres                │
│  ├─ mirror: recipes, foods, shopping…    │◄─────│  ├─ doménové tabulky    │
│  ├─ outbox: fronta lokálních operací     │─────►│  ├─ change_log (seq)    │
│  └─ meta: syncCursor, stav               │      │  └─ sync_applied_ops    │
└──────────────────────────────────────────┘      └─────────────────────────┘
        pull = GET /api/sync/pull?cursor=<seq>
        push = POST /api/sync/push  (dávka operací, idempotentní)
```

- **Online provoz beze změny:** běžné API zapisuje rovnou do Postgres;
  triggery plní `change_log`. Sync vrstva je „vedle", ne „mezi".
- **Mirror** (Dexie): tabulky zrcadlící synchronizované entity, plněné pullem.
  TanStack Query čte při offline z mirroru (persistence adaptérem).
- **Outbox**: každá offline mutace se uloží jako operace; UI se aplikuje
  optimisticky na mirror. Po připojení se outbox odešle pushem.

## 2. Pull

```
GET /api/sync/pull?cursor=<seq>&limit=500
→ {
    changes: [ { table, op, row } ],   // row = celý serializovaný řádek
    nextCursor: 18342,                 // change_log.seq posledního záznamu
    hasMore: true
  }
```

- Kurzor je **serverová sekvence** `change_log.seq` (ne čas — hodiny klientů
  jsou nespolehlivé). Klient si `nextCursor` uloží do `meta`.
- Server vrací řádky filtrované na domácnost uživatele + jeho recepty
  a sdílené recepty; deník jen vlastní (`user_id`).
- `op='delete'` = řádek se `deleted_at` — klient ho v mirroru označí smazaný
  (kaskádu na děti řeší server: mazání rodiče generuje delete záznamy dětí).
- M:N vazby (kategorie/tagy receptu, přiřazení úkolů) se přenášejí **uvnitř
  rodičovského řádku** jako pole ID (`categoryIds`, `assigneeIds`, …).
  Aplikační kód při změně vazeb vždy „dotkne" rodiče (`updated_at`), takže
  se změna propíše do `change_log`.
- První sync = pull od `cursor=0` (bootstrap), stránkovaný po `limit`.
- Retence `change_log`: mažou se záznamy starší 90 dní; klient s starším
  kurzorem dostane `410 Gone` → plný re-bootstrap mirroru.

## 3. Push

```
POST /api/sync/push
{ ops: [ {
    opId: "<uuidv7>",              // idempotence
    entity: "shopping_items",
    entityId: "<uuid>",
    op: "insert" | "update" | "delete",
    payload: { is_checked: true, checked_by: "…" },   // JEN změněná pole
    clientTs: "2026-08-13T18:04:11.222Z"
} ] }
→ { results: [ { opId, status: "applied" | "already_applied"
                        | "merged_partial" | "rejected", 
                 discardedFields?: ["title"], reason?: "…" } ],
    nextCursor }
```

- **Idempotence:** tabulka `sync_applied_ops(op_id PK, result, applied_at)`;
  opakovaný push téhož `opId` vrátí uložený výsledek a nic neaplikuje.
  Retence 90 dní (stejně jako change_log).
- Operace se aplikují v pořadí dávky, každá ve vlastní transakci; jedna
  špatná operace neshodí celou dávku.
- Po pushi klient hned pullne (`nextCursor` v odpovědi), čímž si stáhne
  autoritativní stav včetně cizích změn.
- `insert` s již existujícím `entityId` se zpracuje jako `update` (klient
  mohl op poslat, spadnout před potvrzením a poslat znovu s novým opId).

## 4. Řešení konfliktů

### 4.1 Field-level last-write-wins

- Každý synchronizovaný řádek má na serveru sloupec
  **`field_mtimes jsonb`** — mapa `pole → timestamp poslední změny`.
  Udržuje ho serverový zápisový helper (společný pro běžné API i sync push),
  takže online i offline změny hrají podle stejných pravidel.
- Merge příchozí operace: pro každé pole v `payload` —
  `effectiveTs > field_mtimes[pole]` → aplikuj a zapiš nový mtime; jinak
  pole zahoď. Výsledek `merged_partial` + `discardedFields`, pokud se něco
  zahodilo.
- **`effectiveTs` = min(clientTs, čas přijetí serverem)** — klient s hodinami
  v budoucnosti nemůže „vyhrávat navždy"; klient s hodinami v minulosti
  prohraje jen tam, kde mezitím někdo jiný pole opravdu změnil.
- Eliška změní název, Vojta postup → různá pole, žádný konflikt, obě změny
  projdou. To je celý smysl field-level přístupu.

### 4.2 Speciální pravidlo: odškrtnutí vyhrává

Pro `shopping_items.is_checked` a `tasks.status`:
**přechod do „hotovo/odškrtnuto" vždy vyhrává nad souběžným opačným stavem**,
bez ohledu na timestampy (v obchodě je horší koupit dvakrát než jednou
navíc). „Odškrtnutí" pozdější explicitní akcí (uncheck po synchronizaci)
samozřejmě funguje normálně — pravidlo platí jen pro souběžné konflikty
(obě strany měnily pole, aniž viděly změnu druhé).

### 4.3 Smazání vs. editace

- `delete` vs. souběžný `update`: **delete vyhrává** (soft delete, nic se
  neztratí nenávratně; UI umí smazané zobrazit adminovi? → ne, neplánujeme,
  ale data zůstávají v DB).
- `update` na řádek už smazaný na serveru → `rejected`,
  reason `row_deleted`; klient mirror opraví pullem.

### 4.4 Informování uživatele

Když push vrátí `merged_partial` nebo `rejected`, klient zobrazí nenápadný
toast: „Některé tvé změny (název receptu Bábovka) přepsala novější úprava
od Elišky." + odkaz na dotčený záznam. Zahozené hodnoty se navíc uloží do
lokální tabulky `sync_discarded` (posledních 50), dostupné v Nastavení →
Synchronizace, aby šlo ručně obnovit copy-paste. Nic se nezahazuje tiše.

## 5. Outbox a offline UX

```
outbox( opId, entity, entityId, op, payload, clientTs, state )
        state: 'pending' | 'sending' | 'failed'
```

- Mutační hooky (TanStack Query) zapisují při offline do outboxu + aplikují
  změnu na mirror (optimisticky). Při online jedou přímo na API **a zároveň**
  přes tentýž zápisový helper aktualizují mirror.
- Flush outboxu: při `online` eventu, při startu appky, po intervalu.
  Pořadí FIFO, dávky po 50.
- Indikátor v UI: ikona stavu (synced / pending N změn / offline / chyba)
  v hlavičce; detail v Nastavení → Synchronizace.
- **Fotky:** upload čeká v outboxu jako blob v IndexedDB (`op='photo_upload'`,
  zpracovává se mimo běžný push — multipart na standardní endpoint, opId
  v hlavičce pro idempotenci). Čtení: service worker cachuje `thumb` a `card`
  varianty naposledy zobrazených receptů (LRU, ~50 receptů).

## 6. Rozsah synchronizace (priority dle zadání 7.2)

Synchronizují se všechny doménové tabulky z DATA-MODEL.md kromě technických.
Pořadí implementace ve Fázi 10:

1. Čtení receptů (mirror recipes + foods + kategorie + fotky cache)
2. `shopping_items` check/uncheck ← nejdůležitější reálný scénář
3. `tasks` complete
4. `diary_entries` zápis
5. Vytvoření/editace receptu offline

## 7. Testy (Vitest, povinné)

- Merge: disjunktní pole, stejné pole (LWW oběma směry), clamp budoucího
  `clientTs`, checked-wins oběma směry, delete vs. update, update po delete.
- Idempotence: dvojité doručení téže dávky, `insert` duplicitního `entityId`.
- Kurzor: pull stránkování, `410` po propadnutí retence → re-bootstrap.
