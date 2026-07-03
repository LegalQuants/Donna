# Design — Fiduciary compliance review surface (cross-user auditor view)

> **Date:** 2026-07-03 · **Segment:** Donna fiduciary-grade auditability · **Slice:** reviewer-facing
> half (the upstream-blocked feature the segment deferred). **Backend pin:** `e40b98c` (lq-ai #266).
> **Unblocked by:** the cross-user `auditor` role — `docs/upstream-requests/lq-ai-cross-user-auditor-role.md`
> (delivered) + integration doc **§2.6a**. Sibling ask (signed attestation export) is deferred by
> LQ-AI as **DE-379** and is _not_ part of this slice.

## 1. Purpose

The fiduciary segment shipped the **owner-facing** half of auditability: a user can read their own
per-turn receipts, citation ledger, fiduciary gate, treatment, autonomous-session audit timeline, and
provenance export. The point of "fiduciary-grade" is that _someone other than the author_ can verify
the work. This slice ships the **reviewer-facing** half: a read-only surface where a holder of the new
`auditor` role (or an `admin`) verifies the citation ledger + fiduciary gate of **another user's** chat
or autonomous session.

## 2. What the contract permits (the hard boundary)

From integration doc §2.6a (pin `e40b98c`). The **privileged reader set = `{admin, auditor}`**
(predicate `is_privileged_reader(user) = user.is_admin or user.role == "auditor"`) may cross-user
**read**:

| Endpoint                                               | Used here?                                   |
| ------------------------------------------------------ | -------------------------------------------- |
| `GET /chats/{id}/ledger`                               | **Yes** — chat review (entries + gates)      |
| `GET /autonomous/sessions/{id}/ledger`                 | **Yes** — session review (entries + gates)   |
| `GET /chats/{id}/messages/{mid}/sources`               | No (not needed; receipt renders from ledger) |
| `GET /chats/{id}/messages/{mid}/citations`             | No (chat prose is not shown — see below)     |
| `GET /chats/{id}/receipts` + `…/receipts/export.jsonl` | No (out of scope — YAGNI)                    |

What the privileged set **cannot** read cross-user (all `404`/`403` for a foreign owner):

- `GET /chats/{id}/messages` — the chat message **list/prose**. So the reviewer view shows the
  **receipt** (gate + sources + quoted passages + treatment), not the assistant's conversation text.
- `GET /autonomous/sessions/{id}` (summary), `…/findings`, `…/memory`, `…/artifacts` — so a foreign
  **session review is ledger-only** (gate + `FiduciaryReceipt`), **not** the full `SessionDetail`.
- Any **user directory / listing** — read by **known id only**. No discovery/browse. The reviewer
  cannot resolve the owner's identity, so the UI **labels by id and never asserts ownership**.

Every privileged **cross-user** read writes one `audit_log` row server-side (audit-the-auditor); an
**owner** read of their own id writes none. The client cannot tell which case it is (both return `200`),
so the UI states the honest rule ("cross-user reads are recorded") rather than claiming a specific row
was written.

**Failure-mode matrix the loaders must honour** (privileged caller, ledger endpoints):

- Owner → `200`. Privileged non-owner → `200` (+ server audit row). Non-privileged non-owner → `404`
  (existence-safe). Nonexistent id → `404`. → The loader treats `404` as **"not found or not
  accessible"** (indistinguishable by design) and `403`/non-privileged caller as the **role gate**.

**Honest caveat (DE-378):** the role is read-only by owner-scoping on writes, not by an enforced
gate. The UI labels the surface "read-only reviewer"; it does not imply the backend hard-blocks an
auditor from mutating their _own_ resources.

## 3. Surface

### 3.1 Routes (new top-level group `/(app)/audit`)

- **`/audit`** — landing.
  - Role-gated in `+page.server.ts`: `if (!canAudit(locals.user)) throw error(403, …)`.
  - Renders a short, honest explainer (read-only compliance review; access is recorded in the audit
    log; read by known id — no browse) and a **form** to open a target: a `kind` selector
    (Chat | Session) + an id text field → navigates to `/audit/{kind}/{id}`. Pure client navigation
    (no server round-trip needed to build the URL).
- **`/audit/[kind]/[id]`** — detail. `kind ∈ {chat, session}` (anything else → `error(404)`).
  - `+page.server.ts` loader:
    1. `if (!canAudit(locals.user)) throw error(403, …)`.
    2. Fetch the ledger via `lqFetch` (BFF attaches the bearer): `chat` →
       `/api/v1/chats/{id}/ledger`, `session` → `/api/v1/autonomous/sessions/{id}/ledger`.
    3. `res.status === 404` → `error(404, 'Not found, or not accessible to your role.')`
       (existence-safe wording). Other non-ok → `error(502, …)`. Ok → `parseLedger(await res.json())`.
    4. Return `{ kind, id, ledger, role: locals.user.role }`.
  - `+page.svelte`:
    - Honest header: **"Compliance review"** + subtitle "`{kind}` `{id}` · viewing as `{role}` ·
      cross-user reads are recorded in the audit log."
    - **Chat**: group `ledger.entries` by `message_id` (order groups by each group's earliest
      `created_at`; entries with a null `message_id` fall into a trailing "unattributed" group). For
      each group render a `FiduciaryPill` (gate via `gateForMessage`) + a `FiduciaryReceipt`
      (`entries` = the group, `gate` = that message's gate). `exportMeta` = a chat provenance source
      so the existing client-side provenance export still works.
    - **Session**: one `FiduciaryPill` (gate = `ledger.gates[0] ?? null`) + one `FiduciaryReceipt`
      (`entries` = all, `gate` = first gate). `exportMeta = { type: 'autonomous_session', session_id: id }`.
    - Empty ledger (`entries.length === 0`) → an honest "No ledger entries recorded for this
      `{kind}`." (never a broken/empty card).
    - `onopensource` wired to the doc panel exactly as the chat/automations pages do (`openSource`).

### 3.2 Navigation

- `Sidebar.svelte` gains a `canAudit: boolean` prop. When true, render a **"Review"** nav item
  (`href: /audit`, Lucide `ShieldCheck` icon, `match: ['/audit']`). When false, the item is absent.
- `/(app)/+layout.svelte` passes `canAudit={data.user?.role === 'auditor' || !!data.user?.is_admin}`
  (`data.user` already flows from `+layout.server.ts`).

## 4. Modules & reuse

**Reused verbatim (no changes):**

- `src/lib/fiduciary/FiduciaryReceipt.svelte` — gate summary + per-entry rows + client-side provenance
  export. Already decoupled from any chat/session identity (takes `entries` + `gate`).
- `src/lib/fiduciary/FiduciaryPill.svelte` — the gate trust pill.
- `src/lib/fiduciary/ledger.ts` — `parseLedger`, `entriesForMessage`, `gateForMessage`, types.
- `src/lib/fiduciary/openSource.ts` — doc-panel click-through for a ledger entry.

**New:**

- `src/lib/audit/gate.ts` — `canAudit(user: { role?: string; is_admin?: boolean } | null): boolean`
  = `!!user && (user.is_admin === true || user.role === 'auditor')`. Single source of truth; unit
  tested; used by both loaders and the layout.
- `src/lib/audit/reviewGroups.ts` — `groupChatLedger(ledger): { messageId: string | null; entries;
gate }[]` — pure, tested grouping/ordering used by the chat detail view.
- `src/routes/(app)/audit/+page.server.ts` + `+page.svelte` — landing (gate + form).
- `src/routes/(app)/audit/[kind]/[id]/+page.server.ts` + `+page.svelte` — detail.

## 5. Error handling & honest degradation

- Non-privileged caller anywhere under `/audit` → `403` with a clear "compliance review is available to
  auditor and admin roles" message (the SvelteKit error page). The nav entry is already hidden for
  them, so this is defence-in-depth, not the primary UX.
- `404` from a ledger fetch → existence-safe "not found or not accessible" (never distinguishes a
  missing id from a permission miss — matches the backend's deliberate posture).
- Malformed ledger body → `parseLedger` drops bad rows (house style); a wholly non-JSON body →
  `error(502)`.

## 6. Testing

**Unit / component (vitest):**

- `gate.test.ts` — `canAudit` truth table (admin ✓, auditor ✓, member ✗, viewer ✗, null ✗,
  `is_admin` overrides a non-admin role string).
- `reviewGroups.test.ts` — grouping by `message_id`, ordering by earliest `created_at`, null-message
  entries land in the trailing group, gate association.
- `audit/[kind]/[id]/page.server.test.ts` — mock `lqFetch`: privileged + `200` → returns parsed
  ledger for both kinds and hits the right endpoint per `kind`; non-privileged → `403`; `404` →
  `404`; unknown `kind` → `404`.
- `audit/page.server.test.ts` — landing gate: privileged → ok, non-privileged → `403`.
- `audit/[kind]/[id]/page.svelte.test.ts` — renders a `FiduciaryReceipt` + gate pill from a seeded
  ledger; chat kind renders one receipt per message group; empty ledger renders the honest empty state.

**Live e2e (Playwright, self-cleaning):**

- `tests/audit-review.spec.ts`: SQL-seed (creds `lq_ai`/`lq_ai`) a **second user** row + a chat owned
  by that user + an `ai` turn + a `citation_ledger_entry` (exactly-one source FK) + a
  `work_product_fiduciary_gate` — reusing the seed helpers from `tests/fiduciary-*.spec.ts` but with a
  **foreign `owner_id`**. Log in as the e2e admin (`admin@lq.ai`, already a privileged reader), open
  `/audit/chat/{seededChatId}`, assert the gate pill + a quoted passage render (privileged cross-user
  read succeeds). Teardown deletes the seeded rows in `finally`.
- Assert the **"Review"** nav entry is visible to the admin. (The negative gate — a member/viewer
  seeing no nav entry and getting a 403 — is covered by unit tests, because minting a non-privileged
  _login_ requires a password hash the e2e harness doesn't provision.)

**Gates:** `npm run check` 0/0 · `npm run lint` green · `npx vitest run` green · the e2e above passing.

## 7. Out of scope (explicit)

- Owner **identity** resolution / display (no cross-user user lookup for an auditor).
- The `receipts` / `receipts/export.jsonl` bundle download.
- Foreign-**session** findings/memories/artifacts/timeline (contract-blocked; ledger-only).
- Any **listing/browse/discovery** of chats or sessions.
- **Signed attestation export** — the sibling ask, deferred by LQ-AI as **DE-379**; Slice 4's `Export ▾`
  stays on the honest client-side provenance record until DE-379 ships.

## 8. Build workflow

Superpowers loop: this spec → `writing-plans` → `subagent-driven-development` (TDD per task) →
whole-branch review → PR to `main` with a **merge commit** → mirror `tucuxi`. Branch:
`feat/fiduciary-auditor-reviewer` (already cut; the pin bump is its first commit).
