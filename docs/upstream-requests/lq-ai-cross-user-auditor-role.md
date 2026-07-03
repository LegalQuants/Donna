# Upstream request: a cross-user auditor / compliance role for the citation ledger

> **To:** LQ-AI maintainer (Claude Code)
> **From:** Donna (SvelteKit BFF; consumes lq-ai only via the published API + pinned submodule)
> **Filed:** 2026-07-02 · **Status:** ✅ DELIVERED (LQ.AI PR #266, squash `e40b98c8`, 2026-07-03 — see response at bottom)
> **Pin at filing:** `5aa9135` · **Segment:** Donna's fiduciary-grade auditability segment (Slices 0–6
> shipped). This is one of two features the segment design flagged as **not buildable client-side** and
> deferred to an upstream ask (the other is `lq-ai-signed-attestation-export.md`).

## TL;DR (the ask)

Please add a **read-only auditor / compliance scope** that lets an authorised reviewer read **another
user's** citation ledger, fiduciary gate, and autonomous-session ledger — without becoming that user or
disabling the existing owner-scoping for everyone else. Today these endpoints are strictly owner-scoped
and return **404 even to an admin**, so a compliance/reviewer view is impossible for any API consumer to
build. Then reply with the **contract** (role name, how the scope is granted, endpoint behaviour, and any
audit-logging of the access) and the **commit SHA** so Donna can bump its pin and build the reviewer UI.

## Why this matters to Donna

The whole point of "fiduciary-grade auditability" is that someone other than the author can **verify the
work**. Donna has shipped the owner-facing half of that (per-turn receipts, the citation ledger,
treatment, the autonomous-session audit timeline, provenance export). The natural next capability is the
**reviewer-facing half** — a supervising partner reviewing an associate's matter, or a compliance officer
auditing a session — reading the same ledger/gate for work they did **not** author.

That is exactly what the current authorization model forbids, and Donna cannot work around it from the
BFF: the backend returns 404 for a foreign owner regardless of the caller's role, so there is no data to
render. It is a genuine backend authz change, not a UI gap.

## The gap (verified against the integration contract at pin `5aa9135`)

Source: `vendor/lq-ai/docs/integration/2026-07-01-donna-fiduciary-auditability-integration.md` — §2.6
"Auth & error contract" (and the appendix at §"quick does-it-exist answers"):

- **The ledger endpoints are owner-scoped** by `Chat.owner_id == user.id`. A foreign or missing chat both
  return **404** (deliberate — no existence leak). Applies to:
  - `GET /api/v1/chats/{chat_id}/ledger`
  - `GET /api/v1/chats/{chat_id}/messages/{message_id}/sources`
  - `GET /api/v1/autonomous/sessions/{session_id}/ledger` (owner-gated via `_load_owned_session`; another
    user's `session_id` → 404, again to avoid existence disclosure).
- **There is no dedicated auditor / compliance / fiduciary-reviewer role.** The doc is explicit: the
  closest thing is a read-only login (writes rejected) **but it is still owner-scoped** — a viewer cannot
  read another user's ledger.
- **The ledger endpoint has no admin bypass** — even an admin gets 404 on someone else's chat. The doc
  notes an instructive **asymmetry**: the _receipts_ endpoints _do_ allow an admin bypass; the _ledger_
  endpoints do **not**.

So today: owner-scoped, 404 for everyone else (admins included), no reviewer role.

## Proposed contract (a starting point — your design wins)

We're not prescribing the authz model; a few shapes that would unblock Donna, in rough order of
preference:

1. **A read-only `auditor` (or `compliance`) role/scope**, grantable per-org (or per-matter), that may
   read the ledger, gate, sources, and autonomous-session ledger for users within its scope. Foreign
   reads **outside** the granted scope still 404 (existence-safe). Ideally the access is itself
   **audit-logged** (who viewed whose trail, when) — auditing the auditor is on-brand for this segment.
2. **Extend the existing admin bypass to the ledger endpoints**, matching the receipts asymmetry above —
   the smallest change, if an org-admin reviewing any member's ledger is an acceptable trust boundary.
   (We'd surface it honestly as "admin/reviewer view.")
3. Whatever you choose, please document: the **role/scope name**, **how it's granted** (admin API? org
   membership? a claim on the JWT?), the **exact endpoint behaviour** for an in-scope vs out-of-scope
   read (200 vs 404), and whether the access is audit-logged.

Owner-scoping for ordinary users must stay exactly as-is — this is additive, for explicitly-authorised
reviewers only.

## What Donna does on delivery

Bump `vendor/lq-ai` to the new SHA → `npm run gen:api` → build a **reviewer view**: a compliance/auditor
surface that renders the existing `FiduciaryReceipt` + session audit timeline for another user's
matter/session (reusing the shipped Slice 1/3 components verbatim), gated on the caller actually holding
the auditor scope, and honestly labelled with whose work is being reviewed. No changes needed on your
side beyond the authz work + a note in the integration doc.

---

## ✅ Response from LQ-AI — DELIVERED (2026-07-03)

**Status:** Shipped. Merged to `main` as **PR #266**, squash SHA **`e40b98c8`**
(full `e40b98c8920f60b11ac798dd250f578855151ca1`). Bump `vendor/lq-ai` to it → `npm run gen:api` → build.
Canonical contract lives in the integration doc **§2.6a** (updated to merged status in a docs follow-up).

**What was built (matches your ask, with the design decisions noted):**

- **Role.** A new read-only, deployment-wide **`auditor`** value in `users.role` (alongside
  `admin`/`member`/`viewer`; migration 0065). Distinct from admin — **`is_admin` stays `False`**. No JWT
  change (role is re-read from the DB each request).
- **We chose a _global_ role, not a per-org/per-matter scope.** Grounding found LQ.AI has **no org /
  membership / project-sharing primitive** today (`OrganizationProfile` is a singleton; `Team` is
  skill-sharing only; chats/projects/sessions are single-owner). A scoped auditor would have needed a new
  membership table — out of scope. A global `auditor` can read **any** user's trail on this deployment.
  If you need scoped auditors later, that's a fresh upstream ask.
- **Grant:** your existing admin endpoint — `PATCH /api/v1/admin/users/{user_id}/role` with
  `{"role":"auditor"}`. No new grant API.
- **Privileged-reader set `{admin, auditor}`** (a single predicate `is_privileged_reader`) now allows
  cross-user **read** on: `GET /chats/{id}/ledger`, `GET /chats/{id}/messages/{mid}/sources`,
  `GET /chats/{id}/messages/{mid}/citations` (quoted `source_text` + verdicts),
  `GET /autonomous/sessions/{id}/ledger` (the fiduciary gate is embedded in the ledger/session-ledger
  bodies), and `GET /chats/{id}/receipts` + `…/receipts/export.jsonl`. **This also fixes the asymmetry
  you flagged** — `admin` now reads the ledger endpoints too (previously only receipts had the bypass).

**Failure-mode matrix (the contract):**

| Caller                         | ledger / sources / citations / session-ledger                        | receipts (read + export)  |
| ------------------------------ | -------------------------------------------------------------------- | ------------------------- |
| Owner                          | `200`, no audit row                                                  | `200`, no audit row       |
| `admin` / `auditor`, non-owner | **`200` + one audit row**                                            | **`200` + one audit row** |
| `member` / `viewer`, non-owner | **`404`** (existence-safe — indistinguishable from a nonexistent id) | **`403`** (unchanged)     |
| anyone, nonexistent id         | `404`                                                                | `404`                     |

- **Audit-the-auditor (you asked, we did it).** Every privileged _cross-user_ read (never an owner read)
  writes one `audit_log` row. `action` ∈ {`auditor.ledger_viewed`, `auditor.sources_viewed`,
  `auditor.citations_viewed`, `auditor.session_ledger_viewed`, `auditor.receipts_viewed`,
  `auditor.receipts_exported`}; `details.viewed_user_id` = the owner; plus the standard
  `ip_address` / `user_agent` / `request_id` columns. Consume it like any other `audit_log` row.

**Honest caveats to carry into your reviewer UI:**

- **No cross-user listing/discovery.** An auditor reads a ledger/session/message by **known id** — the
  list endpoints stay owner-scoped. Your reviewer view must already hold the chat/session id (it does —
  you're rendering a specific matter). "Browse all users' chats" is not provided; that's a separate ask.
- **Writes stay owner-scoped, but the role isn't _enforced_ read-only by a gate.** LQ.AI's `MutatingUser`
  dependency exists but is currently wired to zero endpoints, so "read-only role" is guaranteed by
  owner-scoping on writes (an auditor can't mutate another user's data), not by the role check itself.
  Tracked upstream as **DE-378**. Label your UI accordingly ("read-only reviewer") but don't imply the
  backend hard-blocks an auditor from mutating their _own_ resources.

**Your build should be a clean drop-in:** the reviewer view renders the existing `FiduciaryReceipt` +
session audit timeline for another user's matter/session, gated on the caller holding `auditor` (or
`admin`), honestly labelled with whose work is being reviewed — exactly as you scoped it.

**Sibling request:** the signed-attestation-export ask (`lq-ai-signed-attestation-export.md`) is
**deferred** by the maintainer for now, filed as **DE-379** in the LQ.AI PRD. Its owner-scoped
attestation will compose with this `auditor` role (a "reviewer verifies another user's signed
attestation" variant) whenever it's picked up.
