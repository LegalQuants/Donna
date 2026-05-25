# Donna — Handoff for the next session (start P2c Slice B: composer power)

**Date:** 2026-05-25 · **Branch state:** `main` has P0+P1 (#1), P2a (#2), P2b (#3), and **P2c Slice A — Provenance** (#4) all merged. `vendor/lq-ai` pinned at **`7c7ce14`**. Start P2c Slice B off `main`.

---

## 1. What Donna is

A standalone, MikeOSS-inspired **SvelteKit (Svelte 5 runes)** frontend for the **lq-ai** legal-AI backend. The browser talks only to Donna's SvelteKit server (a **backend-for-frontend**) which holds the lq-ai JWT in **httpOnly cookies** and proxies to the lq-ai `api`. lq-ai is vendored at `vendor/lq-ai` (pinned submodule) and brought up by this repo's `docker-compose.yml`. Visual language: document-forward, serif, restrained grays.

Orient with: `README.md`, the specs in `docs/superpowers/specs/` (foundation+roadmap, P2a, P2b citations, P2c-A provenance), `docs/decisions/lq-ai-pin.md` (submodule pin + bump log + compose mechanism), and project memory (`MEMORY.md` index).

## 2. Phase status

| Phase | Status |
|---|---|
| P0 Foundation, P1 Auth+Landing | ✅ merged (#1) |
| P2a Core streaming chat | ✅ merged (#2) |
| P2b Verified citation pills | ✅ merged (#3) |
| **P2c Slice A — Provenance** (Receipts drawer + anonymization indicator) | ✅ merged (#4) |
| **P2c Slice B — Composer power** | ⬅️ **NEXT** |
| P3 Document panel + highlighting · P4 Projects/Matters · P5 Workflows · P6 Tabular · P7 Settings/Trust · P8 Redline | pending |

P2c was split into **Slice A (provenance, done)** and **Slice B (composer)** during brainstorming. Continue the pattern: decompose a large phase into PR-sized slices.

## 3. How to build a phase (the established loop — follow it)

Per **slice**, one PR: **brainstorming** (offer the visual companion for UI questions; decompose if large) → write spec to `docs/superpowers/specs/` → **writing-plans** → **subagent-driven-development** (fresh implementer per task + two-stage review: spec-compliance then code-quality; **commit per task, push regularly**) → **live e2e** against the running stack → final whole-branch review → **finishing-a-development-branch** (open PR into `main`). Feature-branch-in-place (no worktrees). Quality bar: `npm run check` = **0 errors, 0 warnings** (the vendor `ERR_MODULE_NOT_FOUND` stderr is harmless; exit 0 + the "0 errors and 0 warnings" line is the signal). Verify against the **real backend**, not just unit tests. See memory `donna-workflow`.

## 4. Running / verifying the stack

Compose project `donna` on **shifted ports** (app at **http://localhost:13002**). `.env` is gitignored — recreate from `.env.example` if missing, and **re-paste the secrets**: `ANTHROPIC_API_KEY` (generation) and `OPENAI_API_KEY` (embeddings → RAG/citations). Suggest the user rotate any key pasted in chat.

```bash
set -a; . ./.env; set +a
# ingest-worker is required for RAG/citations; donna-web is the app.
docker compose up -d --build postgres redis minio gateway api donna-web ingest-worker
# after editing .env:  docker compose up -d --force-recreate gateway
# after editing src/:  docker compose up -d --build donna-web
# login fixture (admin@lq.ai / DonnaE2ePassw0rd!):
docker compose exec api python -m app.cli reset-admin-password --email admin@lq.ai --password "$DONNA_E2E_PASSWORD" --no-force-change
npm run check && npx vitest run && npx playwright test
```

**Stack notes carried forward (memory `donna-dev-stack`):** RAG/citations need `ingest-worker` + `OPENAI_API_KEY`; embedding is async after KB-attach. The gateway has **anonymization left ENABLED** (so the P2c-A indicator shows; it's off by default). Donna creates **project-less** chats (no project picker until P4), so citations only appear on project-backed chats (seed via API for those tests).

## 5. P2c Slice B scope — composer power

Three pre-send composer features. All have real backend contracts (verify each before building; spike anything ambiguous early, the way P2b/P2c-A did). Likely **sub-decomposition / sequencing** — brainstorm whether to do them as one slice or split further:

- **Model / inference-tier picker.** `GET /api/v1/models` lists available model aliases/tiers; `MessageCreate.model` selects one (Donna currently **hardcodes `'smart'`** in the SSE BFF — `src/routes/(app)/chats/[id]/messages/+server.ts`). Add a composer control to pick model/tier; thread the choice through the BFF. Tie into the existing tier badge. *Verify:* the `/models` response shape + how tier maps to a model alias; whether tier is user-selectable or derived.
- **Skill-attach.** `GET /api/v1/skills` + `/api/v1/skills/autocomplete`; `MessageCreate.skills` (names) + `skill_inputs` (per-skill input bindings; a missing required input → 400 `skill_input_missing`). Add a composer affordance to search/attach skills and supply inputs. *Verify:* the skill list/summary shape (`SkillSummary`), how `skill_inputs` are declared (a skill's required inputs), and how applied skills surface (they already appear as `skill` events in the receipts drawer + in the SSE `applied_skills`).
- **Enhance Prompt.** `POST /api/v1/enhance-prompt` (+ `GET /enhance-prompt/{interaction_id}`). A composer action that rewrites/improves the draft before sending. *Verify:* request/response shape, whether it streams, and the intended UX (replace draft? show a diff/accept?).

**This is composer-UI-heavy → use the visual companion** (picker dropdown, skill chips/autocomplete, Enhance affordance). Key surface: `src/lib/components/Composer.svelte` (the composer; currently value + submit + streaming/stop), and the SSE BFF `src/routes/(app)/chats/[id]/messages/+server.ts` (hardcodes `model:'smart'`, no skills) — both change here.

## 6. Upstream lq-ai fixes (the workflow that recurred in P2c)

The user runs a **separate Claude Code on `LegalQuants/lq-ai`**. If a Donna slice needs a backend change or hits a backend bug, **do not edit `vendor/lq-ai` directly** — write a precise report to `docs/upstream-requests/<name>.md` (root cause, exact file/lines, fix, test), hand it to the user to relay, and when they report the merged SHA: `cd vendor/lq-ai && git fetch && git checkout <sha>` → `npm run gen:api` → rebuild affected containers → verify live → update `docs/decisions/lq-ai-pin.md` bump log → commit on the slice branch. P2c did this twice (#102 `4df3b9b` receipts fields; #103 `7c7ce14` streamed inference logging). Two reports already exist in `docs/upstream-requests/` as examples.

## 7. Key files

- `src/lib/components/Composer.svelte` — the composer (where the picker/skill/enhance controls land).
- `src/routes/(app)/chats/[id]/messages/+server.ts` — SSE BFF; hardcodes `model:'smart'` and sends no `skills` — thread the new fields here.
- `src/lib/chat/chatStream.svelte.ts` — runes controller; `send(content)` posts to the BFF (would carry model/skills).
- `src/routes/(app)/chats/[id]/+page.svelte` — chat page (has the P2c-A header bar + Receipts drawer).
- `src/lib/api/backend.d.ts` — generated types (`npm run gen:api`); `MessageCreate` has `model`/`skills`/`skill_inputs`.
- New BFF routes will be needed for `/models`, `/skills`(+autocomplete), `/enhance-prompt` — mirror the thin-proxy pattern in `src/routes/(app)/chats/[id]/receipts/+server.ts` (uses `lqFetch`).

## 8. Gotchas

- Icons: `@lucide/svelte` (components, `<Icon size={14} />`). Route in Svelte 5: `$app/state`'s `page`.
- `vendor/` is excluded from svelte-check/ESLint/Prettier; regen API types with `npm run gen:api` (sanitizes an upstream YAML backtick bug via `scripts/sanitize-openapi.js`).
- Svelte-check is picky on a11y for `{@html}`/static-element handlers — use `<!-- svelte-ignore <rule> -->` minimally; co-locate `onclick`+`onkeydown`.
- BFF thin-proxy pattern: `lqFetch(event, path)` (auth cookie + refresh-on-401) → `json()` or stream passthrough; map 403/404, else 502.
- Clone with `--recurse-submodules` (or `git submodule update --init`); the submodule is detached at the pinned SHA.

## 9. Open follow-ups (not Slice B blockers)

- **P2b:** popover doesn't re-anchor on scroll (P3 reworks anchoring).
- **P2c-A:** anonymization indicator shows for project-less chats too (it's per-inference, independent of projects) — fine. Once **P4** adds a project picker, citations + retrieval light up for normal UI chats automatically.
- Reliability follow-ups from earlier reviews (in `docs/decisions/lq-ai-pin.md`): distinguish backend-down (503) from logged-out; refresh-cookie TTL vs lq-ai default; TLS for non-localhost deploys.
