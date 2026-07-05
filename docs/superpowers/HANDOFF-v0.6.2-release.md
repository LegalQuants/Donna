# Handoff — Donna v0.6.2 release (near-complete)

> **Written:** 2026-07-04 · Read `CLAUDE.md` first, then this. Durable refs: the auto-memory + `docs/decisions/lq-ai-pin.md`.

## 🏁 v0.6.2 is SHIPPED and verified

- **`main` @ `3878e95`**, pin **`7d788d91`** (lq-ai v0.6.x), mirrored to `tucuxi`. Git tag **`v0.6.2`** on both remotes.
- **5 GHCR images `ghcr.io/legalquants/donna-{web,api,gateway,api-base,gateway-base}:v0.6.2`** — published + **PUBLIC** (anonymous pull verified).
- **Release-image dry-run PASSED** on the published images: 8 services healthy, admin fixture + login OK, and **both shipped fixes verified on the shipped image** — `tool-providers` = `[courtlistener ON, govinfo off, edgar ON, eurlex ON]` (EDGAR/EUR-Lex default-on = Part A) and `POST courtlistener key → 200` (the master-key fix).
- **macOS DMG** `Donna-0.6.2-arm64.dmg` — signed + notarized + stapled (`stapler validate` ✓, `spctl` accepted), attached to GitHub release **`desktop-v0.6.2`**.
- Gates green throughout: check 0/0, lint, vitest 1609.

### What shipped in v0.6.2 (since 0.3.0)
Fiduciary-grade auditability segment (per-turn receipts, ledger, treatment, autonomous audit timeline, provenance export, docs/playgrounds, discovery hints) · **cross-user auditor reviewer** (`/audit`, PR #116) · **Research sources admin card** + **keyless EDGAR/EUR-Lex default-on** (PR #118) · **`LQ_AI_GATEWAY_MASTER_KEY` provisioning fix** so in-app key-setting works (PR #119) + the source-dev compose-forward follow-up (pin `7d788d91`, lq-ai #278) · e2e brittleness fixes (PR #120). CHANGELOG `[0.6.2]` has the full list.

## What REMAINS (small)

1. **About PDF** → `docs/About-Donna-v0.6.2.pdf`. The README **already links it**, so that link 404s until regenerated. Docs-only, does not affect images/DMG. **Recipe** (manual headless-Chromium, per `docs/superpowers/plans/2026-06-23-sticky-skills.md`): drive a logged-in stack, print the 11 `/about` rail pages with the print CSS, `pdfunite` → the PDF, delete `docs/About-Donna-v0.3.0.pdf` (already removed from README refs), commit to `main` + mirror. A running stack with current `/about` is fine as the print source. **Not done this session (context exhausted).**
2. **Fresh-Mac DMG smoke test** — ✅ PASSED (2026-07-04). If it fails, see `desktop/VERIFICATION.md` (prior gotchas: first-run ~10 GB pull can look frozen — fixed in v0.2.1 via a visible pull message).
3. **`docker login ghcr.io`** — I ran `docker logout ghcr.io` for the anonymous-pull test; re-login when convenient (public images pull anon fine without it).

## Environment state (for whoever resumes)
- The **dev stack images were REMOVED** (deliberate, for the from-scratch test) — rebuild with `docker compose up -d --build …` when you next need the dev stack; its **volumes (`donna_pgdata` etc.) are intact** (dev acceptance data preserved).
- A **source-build stack `donnafresh`** at `/Users/kevinkeller/Code/Donna-freshtest` may still be up on the standard ports (13002/18000/…); it's a throwaway (its submodule was bumped to `7d788d91`, override removed). `docker compose -p donnafresh down -v` to clear it.

## Open follow-ups (not blocking; tracked)
- **OpenAPI-export migration debt:** `gen:api` still reads the hand-maintained `vendor/lq-ai/docs/api/backend-openapi.yaml`; lq-ai's DE-373 generated export (`backend-openapi.generated.yaml`) uses module-qualified schema names that would break ~85 Donna type refs. New backend routes are invisible to typegen until migrated (hand-typed in the meantime, e.g. `src/lib/research/toolProviders.ts`). Details in the `44a1de54` entry of `docs/decisions/lq-ai-pin.md`.
- **Signed attestation export** — deferred by lq-ai as **DE-379**; the Slice-4 `Export ▾` stays on the honest client-side provenance record. Reviewer variant composes on the shipped auditor role when picked up.
