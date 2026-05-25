# Donna P2c (Slice A) — Provenance: Receipts drawer + anonymization indicator (design)

**Date:** 2026-05-24 · **Phase:** P2c Slice A · **Branch:** `p2c-provenance-receipts` off `main`

P2c ("provenance & composer power") is split into two PR-sized slices:
- **Slice A (this spec) — Provenance:** the **Receipts drawer** + the **anonymization indicator**. Read-only trust surfaces that continue the verified-substance thesis from P2b.
- **Slice B (later) — Composer power:** model/tier picker, skill-attach, Enhance Prompt.

Depends on the lq-ai pin bump to **`4df3b9b`** (lq-ai #102), which surfaces `anonymization_applied` + `message_id` in the receipts `inference`/`error` event detail (already committed on this branch; see `docs/decisions/lq-ai-pin.md`).

---

## 1. Backend contract (verified live)

`GET /api/v1/chats/{chat_id}/receipts` → a chronological (oldest→newest) array of
`{ ts: string; kind: ReceiptKind; detail: object }`, merged from messages, applied
skills, inference log, and audit log. `kind ∈ {message, retrieval, inference, skill,
audit, error}`. `detail` is free-form per kind (OpenAPI `additionalProperties: true`).
Owner-or-admin only; **403** non-owner, **404** missing. `?event_kinds=a,b` filters
server-side (unknown tokens ignored). `GET …/receipts/export.jsonl` returns the same
payload as JSONL with `Content-Disposition: attachment`.

Real detail shapes observed live (the spec's source of truth for `describeEvent`):

| kind | detail keys |
|---|---|
| `message` | `message_id`, `message_kind` (`user`/`ai`), `role`, `prompt_tokens?`, `completion_tokens?` |
| `retrieval` | `action` (`inference.kb_chunks_retrieved`), `actor_user_id`, `details: { kb_ids[], chunk_ids[], chunk_count, query_token_estimate }` |
| `inference` | `provider`, `model`, `tier` (1–5), `tokens_in?`, `tokens_out?`, `latency_ms?`, `refused`, `refusal_reason?`, **`anonymization_applied`** (bool), **`message_id`** (uuid\|null) |
| `error` | same as `inference` (built from the same row when `refused=true`) |
| `skill` | skill name (one event per applied skill) |
| `audit` | `action`, `actor_user_id`, `details` |

**Anonymization semantics (important for honest UI):** `anonymization_applied=true`
means the gateway's middleware actually redacted something before the request left the
environment. `false` means it ran and redacted nothing (or was skipped for a privileged
chat) — it does **not** mean "your data leaked." This drives the affirmative-only badge
in §4.

---

## 2. Decomposition within Slice A

Two surfaces, one shared data source (the receipts stream):
- **Receipts drawer** (§3) — per-chat, full timeline, the primary provenance surface; its `inference` row shows anonymization status in **both** states.
- **Anonymization indicator** (§4) — per-assistant-message badge, derived from the `inference` event's `anonymization_applied` correlated by `message_id`.

---

## 3. Receipts drawer

**Placement & trigger.** Right **slide-over** panel (over ~half width; chat stays
visible). The chat view (`(app)/chats/[id]/+page.svelte`) currently has no header, so add
a **slim header bar** at the top of the chat column with a right-aligned **Receipts**
button (`@lucide/svelte` `ReceiptText`/`ScrollText`) that toggles the drawer. The bar
leaves room for future header content (title, etc.).

**Rows.** Two-line per event via a pure `describeEvent`: a toned `@lucide/svelte` icon
(message→`MessageSquare`, retrieval→`Search`, inference→`Cpu`, skill→`Puzzle`,
audit→`Shield`, error→`TriangleAlert`), a **bold label** + right-aligned timestamp, and a
**secondary detail line** (humanized). The inference row shows the **tier badge** (same
styling as the in-chat tier chip) and an **anonymization status** (`Anonymized` /
`No anonymization`); refusals render the reason in red (`mlq-error`). A per-row
**"details" expander** reveals the raw `detail` JSON (KB/chunk UUIDs etc.) for power users.

**Behavior.** Fetch-on-open (refetch each open; chats are bounded <100 events).
**Client-side** kind-filter chips (toggle visibility of the already-fetched events — no
refetch). **Export** = a native download link to the export BFF route (always exports the
full log, ignoring active filters). Close via ✕, backdrop click, or Esc. `role="dialog"`,
`aria-modal`, focus moves into the drawer on open and restores on close.

**States.** loading (spinner) · error (+ Retry) · empty ("No receipts yet for this
chat") · list. Unknown `kind` → generic row (icon `Dot`, label = the kind) — never crash.

**BFF routes** (mirror existing `lqFetch` proxy pattern):
- `GET (app)/chats/[id]/receipts/+server.ts` → proxies `/api/v1/chats/{id}/receipts`,
  forwarding an optional `?event_kinds=` query (used by the indicator fetch in §4; the
  drawer fetches unfiltered).
- `GET (app)/chats/[id]/receipts/export.jsonl/+server.ts` → proxies the upstream
  export, forwarding `content-type` + `content-disposition` so the browser downloads.

**Components & files:**
- `src/lib/receipts/types.ts` — `ReceiptKind`, `ReceiptEvent`.
- `src/lib/receipts/format.ts` — pure `describeEvent(e) → { icon, label, detail, tone, tier? }` and `anonStatus(e)`.
- `src/lib/components/ReceiptsDrawer.svelte` — panel, fetch/state, filter chips, export link.
- `src/lib/components/ReceiptEventRow.svelte` — two-line row + details expander.
- `(app)/chats/[id]/+page.svelte` — slim header bar + Receipts toggle.

---

## 4. Anonymization indicator (per-message)

A small, **affirmative-only** badge on an assistant message: a `Shield`/`ShieldCheck`
lucide icon + "Anonymized" (neutral-green, `mlq-success`), shown **only when** that
message's inference had `anonymization_applied === true`. When `false`, **show nothing**
on the bubble (absence = nothing was redacted / not applicable) — the full per-message
status (applied / none) lives in the Receipts drawer's inference row (§3), which is the
complete-transparency surface. Tooltip: "Personal data was anonymized before this
request left your environment." This avoids overclaiming in either direction.

**Data flow — correlate inference→message by `message_id`:**
- A `ChatMessage.anonymized?: boolean` field (on the P2a `ChatMessage` interface).
- **History:** in `(app)/chats/[id]/+page.server.ts` `load`, after building messages,
  fetch `/api/v1/chats/{id}/receipts?event_kinds=inference` once (via `lqFetch`), build a
  `Map<message_id, anonymization_applied>`, and set `m.anonymized` on each assistant
  message. Failure is swallowed (badge simply absent).
- **Fresh stream:** after a turn completes (we have the assistant `message.id`), the
  chat controller fetches the same `…/receipts?event_kinds=inference` (via the §3 BFF
  route) and sets `messages[idx].anonymized` for the matching `message_id`. Reuses the
  one-retry race pattern from P2b's `loadCitations` (the inference row may lag the stream
  close slightly). `retry()` clears `anonymized`.

**UI placement:** in `Message.svelte`, beside the existing tier chip (top-right of the
assistant turn), rendered only when `message.anonymized === true`.

---

## 5. Error handling & edge cases

- Receipts fetch fail (drawer) → error + Retry. 403/404 → "Receipts unavailable."
- Indicator receipts fetch fail (load or fresh) → `anonymized` stays undefined → no badge (silent, non-blocking).
- `anonymization_applied === false` or `message_id === null` → no badge.
- Unknown event kind in the drawer → generic row.
- Export download always available (streams whatever the backend returns).

---

## 6. Out of scope (later)

- Composer power (model/tier picker, skill-attach, Enhance Prompt) — **Slice B**.
- A persistent chat header with title/rename — only the slim bar + Receipts button here.
- Server-side pagination of receipts (replay-at-read; bounded <100 events for M1).

---

## 7. Testing

- **Unit (vitest):** `format.describeEvent` for all six kinds + unknown fallback +
  missing-field tolerance; tier extraction; `anonStatus` (applied/none); a
  `message_id → anonymized` map builder for the indicator (incl. null message_id, missing
  inference event).
- **Component (@testing-library/svelte):**
  - `ReceiptsDrawer` — fetch-on-open renders N rows; a filter chip hides a kind;
    empty/error/loading states; export link `href`; Esc closes; inference row shows tier
    badge + anonymization status.
  - `ReceiptEventRow` — two-line render per kind; details expander toggles raw JSON.
  - `Message` — renders the "Anonymized" badge when `anonymized===true`, and **not** when
    `false`/undefined (the reliably-testable invariant, since live `true` needs real PII).
- **e2e (Playwright, live):** open the seeded chat → click **Receipts** → assert an
  `inference` row (Opus 4.7 · Tier 4) and a `retrieval` row render, the inference row
  shows an anonymization status, a filter chip narrows the list, and the export link is
  present. Assert structural invariants (not exact counts/text). The per-bubble badge's
  **true** state is covered at the component level (dev anonymization is commonly `false`,
  so we don't depend on the live engine redacting); the e2e asserts **no** false-positive
  badge on the seeded (`anonymization_applied=false`) turn.
- Quality bar: `npm run check` = **0 errors, 0 warnings**; `npx vitest run`;
  `npx playwright test` (vendor `ERR_MODULE_NOT_FOUND` stderr is harmless; exit 0 + the
  "0 errors and 0 warnings" line is the signal).

---

## 8. Key decisions (flagged for review)

1. **Affirmative-only badge** (§4): the bubble shows "Anonymized" only when something was
   actually redacted; `false` shows nothing (full status in the drawer). Alternative —
   show a two-state badge (Anonymized / Not anonymized) — was rejected as misleading given
   `false` usually means "nothing to redact."
2. **Indicator live-test approach** (§7): true-state via component tests, not live e2e,
   because forcing real anonymization in dev isn't reliable. The live e2e proves the
   drawer + the no-false-positive invariant.
3. **Client-side filtering** (§3): fetch-all-then-filter (chats are small), so chips are
   instant and export stays full-log.
