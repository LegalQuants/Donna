# Upstream request: a cross-user auditor / compliance role for the citation ledger

> **To:** LQ-AI maintainer (Claude Code)
> **From:** Donna (SvelteKit BFF; consumes lq-ai only via the published API + pinned submodule)
> **Filed:** 2026-07-02 · **Status:** OPEN
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
