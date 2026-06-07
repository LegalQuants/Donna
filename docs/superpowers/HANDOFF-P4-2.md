# Donna — Handoff for the next session (continue P4: P4-2 privilege/tier, then P4-3 documents)

**Date:** 2026-05-27 · **Branch state:** `main` has everything through **P4-1** — P0/P1 (#1), P2a (#2), P2b (#3), P2c-A (#4), P2c-B (#5–#8), P3-1 (#9), P3-2 (#10), P3-3 (#12), **P4-1 matters core + chat scoping (#13)**. `vendor/lq-ai` pinned at **`438198c`**. You are on `main`; start the next slice off `main`.

> **First thing:** `git checkout main && git pull` (confirm HEAD is the #13 merge `68fd91f` or later). Pin check: `git -C vendor/lq-ai rev-parse --short HEAD` → `438198c`. The dev stack is up and `.env` is populated (see §4). Read project memory first (`MEMORY.md` index — esp. `donna-phase-status`, `donna-product-direction`, `donna-workflow`, `donna-dev-stack`, `donna-citation-contract`).

## 1. What Donna is

Standalone MikeOSS-inspired **SvelteKit (Svelte 5 runes)** frontend for the **lq-ai** legal-AI backend. Browser talks only to Donna's SvelteKit server (a **BFF**) which holds the lq-ai JWT in httpOnly cookies and proxies to the lq-ai `api`. lq-ai is vendored at `vendor/lq-ai` (pinned submodule), brought up by this repo's `docker-compose.yml`. Visual language: document-forward, serif, restrained grays. **Product thesis (important — see memory `donna-product-direction`):** Donna exposes the lq-ai backend's power through a **friendly, minimal-chrome, plain-language UX** — the _opposite_ of the LQ_AI developer frontend's menu-dense, capability-showcase style. When porting an LQ_AI capability, re-imagine it the Donna way.

## 2. Phase status

| Phase                                                      | Status                                                          |
| ---------------------------------------------------------- | --------------------------------------------------------------- |
| P0–P2c-B                                                   | ✅ merged (#1–#8)                                               |
| P3 — Document panel + highlighting                         | ✅ P3-1 (#9), P3-2 (#10), P3-3 (#12)                            |
| **P4 — Projects / Matters**                                | **P4-1 ✅ (#13)** · **P4-2 ⬅️ NEXT (recommended)** · P4-3 after |
| P5 Workflows · P6 Tabular · P7 Settings/Trust · P8 Redline | pending                                                         |

**P4-1 shipped (#13):** a first-class **Matters** surface + chat scoping. `/matters` (row list + create modal), `/matters/[id]` (detail: chats list, "New chat in this matter", rename, archive), a **composer matter-picker** (landing/new-chat only — a chat's `project_id` is fixed at creation), and a read-only **matter badge** in the chat header. Scoping a chat to a matter that has a KB lights up RAG/citations for _normal_ UI chats (the e2e proves it). Code lives in `src/lib/matters/` + `src/routes/(app)/matters/`.

## 3. How to build a slice (the established loop — follow it)

Per slice, one PR into `main`: **brainstorming** (use the visual companion for UI layout questions; spike the live backend contract early; decompose if the phase is multi-subsystem) → write spec to `docs/superpowers/specs/` → **writing-plans** (bite-sized TDD tasks, complete code in every step) → **subagent-driven-development** (fresh implementer per task + **two-stage review: spec-compliance then code-quality**; the controller verifies each reviewer finding before acting; commit per task; final whole-branch review) → **live e2e** against the running stack → **finishing-a-development-branch** (open PR). Quality bar: `npm run check` = **0 errors, 0 warnings** (the vendor `ERR_MODULE_NOT_FOUND` stderr is harmless; the signal is exit 0 + the "0 errors and 0 warnings" line). Keep **eslint clean on touched files** (`npx eslint <files>`); single-targeted ignores only where a rule genuinely fires. Verify against the **real backend**, not just unit tests; **rebuild `donna-web` before any live e2e** (`docker compose up -d --build donna-web`) — the container serves a built image, not live `src/`.

**Patterns proven across P3/P4-1 (reuse them):** thin BFF proxy per backend endpoint **OR** SvelteKit **form actions** for mutations on page routes (P4-1 established this — a route can't host both a `+page` and a GET `+server`, so create/rename/archive/etc. are form actions); SSR `load` for page data (the composer picker reads its matter list from the landing `load`, no client store); presentational components with plain props in a per-feature `src/lib/<feature>/` folder; searchable popovers mirror `ModelPicker`/`SkillAttach` (root div + `open` state + outside-click `$effect` + Escape); modals mirror `ReceiptsDrawer` (`role="dialog"` + `aria-modal` + `aria-label` on the panel, backdrop `role="presentation"` click-to-close, a capture-phase Escape `$effect`). Reviewers repeatedly caught real issues — re-imported untrack for one-time `$state`-from-props seeding, a modal that stayed open after a non-redirect form success (close it with `$effect(() => { if (form?.success) … })`), and live-e2e flakiness from prefix-matching accumulated seed data (use **exact-name** locators + clean up seeded rows). Fix what's real, push back on what isn't (receiving-code-review judgment).

## 4. Running / verifying the stack

Compose project `donna` on shifted ports (app **http://localhost:13002**, lq-ai api `127.0.0.1:18000`, gateway `18001`). `.env` is gitignored but present and populated (`ANTHROPIC_API_KEY`, `OPENAI_API_KEY` for embeddings→RAG/citations, `DONNA_BASE_URL=http://localhost:13002`, `DONNA_E2E_EMAIL=admin@lq.ai`, `DONNA_E2E_PASSWORD`). Suggest the user rotate any key pasted in chat.

```bash
set -a; . ./.env; set +a
docker compose up -d --build postgres redis minio gateway api donna-web ingest-worker
docker compose up -d --build donna-web   # after editing src/ (REQUIRED before live e2e)
npm run check && npx vitest run && npx playwright test
```

**Stack notes (memory `donna-dev-stack`):** RAG/citations need `ingest-worker` + `OPENAI_API_KEY`; embedding is async after KB-attach (citation/scoping e2e seed a project+KB+PDF and are timing-sensitive — pass on retry once embeddings settle). Gateway anonymization is ENABLED. `/tmp/spike.pdf` is the seed fixture (the matters e2e regenerates it via the `api` container). **Live-e2e gotcha (P4-1):** seeds accumulate in the shared admin account across runs — use unique `Date.now()` names, **exact-name** Playwright locators, and DELETE seeded projects at end-of-test (the picker/list excludes archived).

## 5. Next slices — P4-2 (recommended) then P4-3

P4-1 deliberately deferred the rest of P4. Backend reality verified 2026-05-27 against the generated types Donna consumes:

### P4-2 — Privilege & tier-floor (recommended next; small, backend-READY)

Matches the LQ_AI "New matter" modal (privileged checkbox + minimum-tier select). Add to the **create + rename** forms (`src/lib/matters/MatterForm.svelte`):

- **`Project.privileged`** (boolean) + **`Project.minimum_inference_tier`** (1–5 | null). Both settable on `POST /projects` (ProjectCreate) and `PATCH /projects/{id}` (ProjectUpdate).
- **Coupled rule (server-enforced):** `privileged=true` **requires** `minimum_inference_tier` set — POST returns **422**, PATCH returns **400** otherwise. The form must enforce/surface this (disable submit or show the error). Re-checked on PATCH against merged state.
- Effect: every chat in a privileged project is flagged `privilege_marked` in the audit log; the gateway enforces the tier-floor via the forwarded header `lq_ai_project_minimum_inference_tier`.
- **UI:** a reserved high-contrast **privileged** visual token was defined back in P0 (check `app.css`/tailwind config + the foundation spec) — use it for a privileged badge on the matter list row + detail header. Surface the tier-floor near the model picker when a chat is in a tier-floored matter (the model picker's tier data is in `src/lib/models/`; see memory note on `routed_inference_tier` reality). Also: there's a deployment-level `admin/tier-policy` (global floors) — out of scope unless asked.

### P4-3 — Matter documents, KBs & skills (higher user value; backend-READY)

The document UX the user cares about (see `donna-product-direction`). As **sections in the single-column matter detail** (Donna's friendlier take on LQ_AI's matter rail):

- **Files:** attach files to a matter (`POST /projects/{id}/files`; `Project.attached_file_ids`), list them, remove.
- **Knowledge:** link a KB to a matter (`POST /projects/{id}/knowledge-bases`) and — bigger — **upload documents into a KB** with ingestion-status feedback (`POST /files` → `POST /knowledge-bases/{kid}/files`; poll `ingestion_status`). Donna has NO KB-upload UI today.
- **Skills:** attach skills to a matter (`Project.attached_skill_names`). (Skill _authoring_ — create/update — is P5.)
- **Context:** edit `Project.context_md` (matter context Markdown, ≤100 KiB).

### Broader backlog (memory `donna-product-direction`)

Chat-level **file upload** in the composer (skill-attach already exists from P2c-B2); **skills authoring** + **playbooks** (create incl. "generate from prior agreements", apply in workflow/chat) → **P5 Workflows**. **Upstream-blocked** (need an lq-ai request first): folder tree for matter files, file versions, project sharing/ACL.

**Which next?** P4-2 is the quick, self-contained completion of the matter create/detail surface and is visually validated by the LQ_AI Image-1 modal. P4-3 delivers the document-attach UX the user emphasized but is larger (decompose it — e.g. matter-files first, KB-upload second). Decide at the next session's brainstorm/decompose step.

## 6. Key files (the P4-1 matters feature)

- `src/lib/matters/types.ts` — `Matter` (= backend `Project`), `MatterSummary` ({id,name}), `activeMatters` (filters `is_sandbox`).
- `src/lib/matters/MatterBadge.svelte` — read-only chip (link or "No matter").
- `src/lib/matters/MatterForm.svelte` — create/edit form (name+description; `use:enhance`; **P4-2 adds privileged + tier fields here**).
- `src/lib/matters/MatterPicker.svelte` — searchable popover; `$bindable selectedId`.
- `src/routes/(app)/matters/+page.{server.ts,svelte}` — list `load` + `create` action + create modal.
- `src/routes/(app)/matters/[id]/+page.{server.ts,svelte}` — detail `load` + `rename`/`archive`/`newChat` actions (**P4-3 adds Files/Knowledge/Skills/context sections here**).
- `src/lib/components/Composer.svelte` — optional `matters` prop + bindable `selectedMatterId` (landing-only picker).
- `src/routes/(app)/+page.{server.ts,svelte}` — landing: `load` matters + thread `project_id` in `start`.
- `src/routes/(app)/chats/[id]/matter.ts` (`resolveMatter`) + `+page.{server.ts,svelte}` — chat-header badge.
- `tests/matters.spec.ts` — the live-e2e seeding + exact-name + cleanup pattern to copy.

## 7. Upstream lq-ai fixes (workflow that recurs)

The user runs a separate Claude Code on `LegalQuants/lq-ai`. If a slice needs a backend change/bug fix, **don't edit `vendor/lq-ai` directly** — write a precise report to `docs/upstream-requests/<name>.md` (root cause, exact file/lines, fix, test), hand to the user to relay, and on the merged SHA: `cd vendor/lq-ai && git fetch && git checkout <sha>` → `npm run gen:api` → rebuild affected containers → verify live → update `docs/decisions/lq-ai-pin.md` bump log → commit. P3 and P4-1 needed no backend changes. P4-3's folder-tree/versions and any sharing would be the first P4 upstream asks.

## 8. Gotchas

- **Form-action server tests (P4-1 pattern):** mock `lqFetch`, build a `Request` with a `URLSearchParams` body so `event.request.formData()` parses it; `redirect()` throws `{status, location}` (assert with `.rejects.toMatchObject`), `fail()` returns `{status, data}`. The `PageServerLoad` return union includes `void` — cast the `await load(...)` result in tests (don't weaken assertions). See `src/routes/(app)/matters/page.server.test.ts`.
- **`ChatUpdate` can't change `project_id`** — a chat's matter is fixed at creation; the picker is new-chat-only; existing chats only display the badge.
- Svelte-check: `state_referenced_locally` when seeding `$state` from a prop → wrap the init read in `untrack(() => prop)` (codebase idiom). In-app `<a href>` trips `svelte/no-navigation-without-resolve` → single-line `eslint-disable-next-line` directly above `<a>` (keep `<a` and `href` on the same line so it can't drift).
- **Pre-existing lint debt:** `eslint .` (the `npm run lint` script) is red repo-wide — ~35 `no-explicit-any` in test files (`as any` event stubs), unrelated to recent work. The real gate is `npm run check` (svelte-check) at 0/0 + eslint clean on _touched_ files. Don't try to fix the whole test suite's `as any`.
- Icons `@lucide/svelte` (`<Icon size={n} />`). Route state via `$app/state`'s `page`. `vendor/` excluded from svelte-check/ESLint/Prettier; regen API types with `npm run gen:api`. Vitest jsdom; component tests use `@testing-library/svelte` + `userEvent`/`fireEvent`; `expect: { requireAssertions: true }`; mock `$app/forms` (`enhance`) for form-component unit tests.
- Live e2e: rebuild `donna-web` first; assert on unique controls / exact names; clean up seeded data.

## 9. Open follow-ups (not blockers unless touched)

- **P4-3 non-PDF path:** uploading a non-PDF to a matter/KB or chat makes the P3-3 `UnsupportedFileCard` reachable live for the first time.
- Reliability (from `docs/decisions/lq-ai-pin.md`): distinguish backend-down (503) from logged-out; refresh-cookie TTL; TLS for non-localhost. Pre-existing `res.json()`-on-malformed-ok is unguarded across all loaders (infra-failure edge).
- Chat-load does an extra sequential `GET /chats/{id}` + `GET /projects/{id}` for the badge — could parallelize with the messages fetch if load latency becomes visible.
- P3 polish backlog: keyboard-driven panel resize (`role="separator"` + arrow keys); full `role="tablist"` + keyboard nav for the doc-panel tab strip (deferred with aria-current).
- B2 deferred structured `skill_inputs` forms; B3 deferred `edited_before_use` enhance telemetry.
