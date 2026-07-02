# Handoff — Fiduciary segment tail (upstream asks + release cut)

> **Written:** 2026-07-02 · **For:** the next session. Read `CLAUDE.md` first (canonical engineering
> guide), then this. The durable references are the auto-memory
> (`memory/donna-fiduciary-auditability-segment.md`) and `.superpowers/sdd/progress.md`.

## Where things stand

The **fiduciary-grade auditability segment is functionally complete.** On `main` (mirror `tucuxi`, kept
in sync), pin `5aa9135`:

- **Build slices 0–5 + 6-lean — all shipped** (research-sources card · per-turn receipt + 4 trust states ·
  treatment/validity · autonomous audit timeline · provenance export · `/about/fiduciary` guide +
  `trust-states.html` + docs · localStorage dismissable discovery hints).
- **Playground wiring — shipped** (PR #115, `0fcc0bb`): vendored LQ-AI's 5 fiduciary Learn playgrounds
  into `static/learn/playgrounds/` + per-section drill-downs on `/about/fiduciary` + registered in the
  `/about/lq-ai` gallery. Framed honestly as illustrative. **No pin bump** (static viz decoupled from the
  API contract).
- Gates green throughout: `npm run check` 0/0 · `npm run lint` green · `npx vitest run` **1570**.

## The two things waiting on LQ-AI CC (the reason for this handoff)

Both filed 2026-07-02 (PR #114, on `main`+`tucuxi`); **LQ-AI CC is working them now.** When they reply
with a **contract + a commit SHA**, this is the work:

### 1. Cross-user auditor role — `docs/upstream-requests/lq-ai-cross-user-auditor-role.md`

- **Ask:** a read-only auditor/compliance scope to read _another user's_ ledger/gate/session-ledger
  (today owner-scoped, 404 even to admin).
- **On delivery:** `cd vendor/lq-ai && git fetch && git checkout <sha>` → `npm run gen:api` → rebuild
  `api arq-worker ingest-worker donna-web` → verify the new authz in `src/lib/api/backend.d.ts` → log
  in `docs/decisions/lq-ai-pin.md` → **build a reviewer view** that renders the shipped
  `FiduciaryReceipt` (chat) + `SessionDetail` audit timeline for another user's matter/session, gated on
  the caller holding the auditor scope, honestly labelled with whose work is being reviewed. Reuse the
  Slice 1/3 components verbatim. Follow the build loop (brainstorm → plan → SDD → review → PR merge-commit
  → mirror `tucuxi`).

### 2. Signed attestation export — `docs/upstream-requests/lq-ai-signed-attestation-export.md`

- **Ask:** a server-side signed/Merkle attestation export (today only an unsigned unchained per-message
  `content_hash`; no signed export endpoint).
- **On delivery:** pin bump (as above) → **point Slice 4's existing `Export ▾` menu**
  (`src/lib/fiduciary/FiduciaryReceipt.svelte` + `provenanceExport.ts` + `download.ts`) at the signed
  endpoint as a new "Signed attestation" item, render the verification result honestly, and only then use
  integrity language ("verifiable/signed") that today's honest-copy export deliberately avoids. The Slice
  4 UI was built for exactly this drop-in.

**Pin-bump note:** bumping past `5aa9135` also pulls in the intervening backend changes on LQ-AI main
(`0766164` at handoff time: SEC EDGAR #254, EUR-Lex #257, OpenAPI-gen #255, honesty audit #260,
playgrounds #262). Those make the authority sources (already described in `/about/fiduciary` + surfaced
by the Slice 0 research-sources card) live — verify `/research/sources` + the ResearchSourcesCard after
the bump, and run the full gates + a smoke e2e as a regression check.

## After both asks land: the release cut

**User sequencing (locked): release comes AFTER the two asks are settled.** Then, per
`docs/BUILD-AND-RELEASE.md`: cut new GHCR images (`release.yml`) + a signed/notarized macOS DMG
(`desktop-release.yml`) + regenerate the About PDF. Gotcha from prior releases: notarytool 403
"agreement missing/expired" = accept the Apple Developer Program License Agreement on developer.apple.com
(NOT App Store Connect); making GHCR packages public is org-owner-gated.

## Conventions to keep (from CLAUDE.md)

Never edit `vendor/lq-ai`. Merge PRs to `main` with a **merge commit** (never squash), then
`git push tucuxi main`. Rebuild `donna-web` before any manual/e2e check. Live e2e SQL-seed pattern (creds
`lq_ai`/`lq_ai`; the fiduciary seed = chat + assistant turn kind='ai' + `message_caselaw_citations` +
`citation_ledger_entry` [exactly-one source FK] + `work_product_fiduciary_gate`; session ledger also
needs `chats.autonomous_session_id`) is in `tests/fiduciary-*.spec.ts`. `.env` provides the shifted ports

- e2e creds. Build every non-trivial change via the superpowers loop (brainstorm → writing-plans →
  subagent-driven-development → whole-branch review → PR).

---

## Ready-to-paste session-start prompt (next session)

> Resume the Donna fiduciary-auditability segment (`/Users/kevinkeller/Code/Donna`). Read
> `CLAUDE.md`, then `docs/superpowers/HANDOFF-fiduciary-tail.md`, then the auto-memory
> `donna-fiduciary-auditability-segment.md`. State: the whole segment is shipped (build slices 0–5 +
> 6-lean + the LQ-AI playground wiring, PR #115) on `main`@`0fcc0bb`, pin `5aa9135`, mirrored `tucuxi`;
> gates green (vitest 1570). Two upstream asks are filed (PR #114) and LQ-AI CC is working them:
> `docs/upstream-requests/lq-ai-cross-user-auditor-role.md` and `-signed-attestation-export.md`.
>
> I will paste LQ-AI CC's responses (contract + commit SHA) for one or both asks. For each: bump the
> `vendor/lq-ai` pin to the given SHA (`git fetch && git checkout <sha>` → `npm run gen:api` → rebuild
> `api arq-worker ingest-worker donna-web` → verify the contract in `src/lib/api/backend.d.ts` → log in
> `docs/decisions/lq-ai-pin.md`), then build the consuming slice via the superpowers loop —
> **(auditor role)** a reviewer view reusing `FiduciaryReceipt` + `SessionDetail`; **(signed export)**
> wire Slice 4's `Export ▾` menu to the signed endpoint. The pin bump also lights up the EDGAR/EUR-Lex
> authority sources — verify `/research/sources` + the ResearchSourcesCard and run a regression e2e.
> After BOTH asks ship, do the release cut (`docs/BUILD-AND-RELEASE.md`: images + notarized DMG + About
> PDF) — release is sequenced AFTER the asks. Keep gates green; merge-commit PRs to `main`; mirror
> `tucuxi`.
