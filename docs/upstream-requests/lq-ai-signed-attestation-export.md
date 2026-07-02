# Upstream request: a server-side signed attestation export for the provenance record

> **To:** LQ-AI maintainer (Claude Code)
> **From:** Donna (SvelteKit BFF; consumes lq-ai only via the published API + pinned submodule)
> **Filed:** 2026-07-02 · **Status:** OPEN
> **Pin at filing:** `5aa9135` · **Segment:** Donna's fiduciary-grade auditability segment (Slices 0–6
> shipped). This is one of two features the segment design flagged as **not buildable client-side** and
> deferred to an upstream ask (the other is `lq-ai-cross-user-auditor-role.md`).

## TL;DR (the ask)

Please add a **server-side signed export** of the provenance record — the citation ledger + fiduciary
gate (+ the per-message `content_hash`es) wrapped in a **cryptographically verifiable** envelope (a
detached signature / JWS, and/or a hash-chained Merkle attestation), with a **documented verification
path** (a public key or a verify endpoint). Today there is **no cryptographic integrity mechanism** on the
trail and **no signed export endpoint** — only an unsigned, unchained per-message `content_hash`. Then
reply with the **endpoint(s)**, the **envelope/signature format**, the **verification procedure**, and the
**commit SHA** so Donna can bump its pin and wire the signed export.

## Why this matters to Donna

Donna has already shipped the **honest, unsigned precursor**: Slice 4 exports any chat turn or autonomous
session's provenance record as a structured JSON envelope + a printable Markdown copy, assembled entirely
client-side from the already-fetched ledger. It is labelled — verbatim — _"a faithful copy of the sourcing
trail — not a cryptographically signed attestation,"_ and the export menu was **deliberately designed so
the same affordance can point at a real signed-export endpoint** with no rework (progressive enhancement).

What Donna **cannot** do from the BFF is manufacture cryptographic integrity: it can't sign on the
server's behalf, and there's nothing server-side to verify a copy against. A genuinely tamper-evident
attestation — the thing a court or a counterparty would actually rely on — has to originate in the
backend that holds the signing key and the canonical records. That's this ask.

## The gap (verified against the integration contract at pin `5aa9135`)

Source: `vendor/lq-ai/docs/integration/2026-07-01-donna-fiduciary-auditability-integration.md` — §3.1
"Immutability / integrity model" and §3.4 "Export," plus §6.4:

- **There is NO cryptographic integrity mechanism on the audit/citation trail today.** No hash-chaining,
  no Merkle log, no digital signatures, no HMAC on ledger entries, gate rows, citation rows, or the
  message trail. The trail is **append-only by convention, not cryptographically enforced.**
- **The one tamper-evidence primitive** is `WorkProductAttribution.content_hash` — a per-message SHA-256
  of the assistant message content — and it is explicitly **unchained and unsigned**. The code documents
  the Merkle-chaining layer as _"future M2+"_; it does not exist yet.
- **No dedicated ledger/gate export endpoint exists (signed or unsigned).** The existing
  `POST /users/me/export` job produces `work_product_attribution.json` (carrying the unsigned
  `content_hash`) — **no ledger, no gate, ZIP unsigned.** The `receipts/export.jsonl` stream is the
  audit_log only, also unsigned.
- §6.4 states plainly: assemble any "export this trace" affordance client-side and label it honestly as a
  **provenance record, not a signed attestation** — because _"there is no server-side signed export
  today."_ It even suggests designing the button so it can later point at a real signed-export endpoint —
  which is exactly what Donna's Slice 4 did, and exactly what this ask would light up.

## Proposed contract (a starting point — your design wins)

We're not prescribing the crypto; a few shapes that would unblock Donna, in rough order of preference:

1. **A signed attestation endpoint per subject**, e.g.
   `GET /api/v1/chats/{chat_id}/attestation` and `GET /api/v1/autonomous/sessions/{session_id}/attestation`,
   returning the canonical ledger + gate (+ `content_hash`es) as a **signed envelope** — a JWS/COSE
   detached signature over a canonicalised JSON payload is ideal (Donna can render the payload and show
   "signature valid" via a documented public key). Owner-scoped like the ledger itself.
2. **Ship the "future M2+" Merkle layer** so each attestation includes a chain/inclusion proof — the
   strongest form, if it's already on your roadmap.
3. Whatever you choose, please document: the **payload canonicalisation** (so a verifier gets a stable
   byte string), the **signature format + algorithm**, **where the public key / verification endpoint
   lives**, whether the signature covers the ledger+gate or only the `content_hash`es, and the endpoint's
   **auth scope** (owner-scoped is fine; a reviewer variant would compose with the auditor-role ask above).

An unsigned-but-canonical export endpoint (server-assembled, stable byte layout) would be a useful
intermediate even before signing — but the value Donna's users are asking for is the **verifiable**
attestation.

## What Donna does on delivery

Bump `vendor/lq-ai` to the new SHA → `npm run gen:api` → **point Slice 4's existing "Export ▾" menu at the
signed endpoint** as a new "Signed attestation" item (or upgrade the current JSON export in place),
render the verification result honestly ("signature valid, verified against LQ-AI's key"), and only then
use integrity language ("verifiable / signed") that today's honest-copy export deliberately avoids. The
Slice 4 UI was built for exactly this drop-in. No changes needed on your side beyond the endpoint +
verification docs + a note in the integration doc.
