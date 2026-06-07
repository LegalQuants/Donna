# Powered by LQ-AI: "How to Build" (slice 2b-ii) — Design Spec

**Date:** 2026-06-03 · **Slice 2b-ii** (completes the LQ-AI mirror) · **Pin:** `vendor/lq-ai` @ `c22360a`
**Branch:** `feat/about-lq-ai-build` (off `main`, which has the merged 2b-i How-It-Works page).

## Goal

Add a **"How to Build"** sub-page at `/about/lq-ai/build` — a **curated** port of LQ-AI's contributor
"How to Build" tab, re-skinned in Donna's design — and cross-link it with the How-It-Works page. This
completes the "Powered by LQ-AI" surface: How It Works (the architecture tour) + How to Build (how to
extend/contribute). See [[donna-about-page]].

## Decision (locked in brainstorm, 2026-06-03)

- **Curated port:** port the durable, inspiring sections faithfully; **condense** the hyper-repo-specific
  sections (the list of 7 curated mini-PRDs with effort estimates; the exact CI/PR-gate commands) into a
  short lead-in + a link to the live repo, so the page doesn't carry granular internal detail that drifts.
- Same re-skin-natively approach as 2b-i (`mlq-*` tokens; no LQ-AI `lq-*` stylesheet).

## Source material

- LQ-AI page: `vendor/lq-ai/web/src/routes/lq-ai/learn/build/+page.svelte` (599 lines). 7 `<h2>` sections:
  1. The contribution path · 2. Want to contribute a skill? Start here. · 3. Curated mini-PRDs ·
  2. Before you open a PR: what must pass · 5. Anatomy of an aligned agentic flow (M4) · 6. The roadmap ·
  3. GitHub.
- Playgrounds: copy **`skill-format.html`** (embedded as an iframe in §2) and **`test-landscape.html`**
  (linked full-screen from §4) into `static/learn/playgrounds/`. (`otel-eval.html` is already present
  from 2b-i.) This brings the total copied playgrounds to all 18.

## Page structure (`/about/lq-ai/build/+page.svelte`)

Re-skinned natively. Keep the `<h1>Powered by LQ-AI — How to Build</h1>` distinct from the How-It-Works
`<h1>`. A **"← How it works"** back-link to `/about/lq-ai` at the top.

1. **Intro** — port: "Everything you need to go from curious to contributor — whether you're a practicing
   attorney, a security engineer, or a developer looking for a well-scoped first PR." (Normalize LQ.AI→LQ-AI.)
2. **The contribution path** — port faithfully (short prose + the CONTRIBUTING.md link).
3. **Contribute a skill** (centerpiece) — port: the prose, the **4-step flow** (Claim · Draft · Attest ·
   Review) as native step markup, the **Skill Format Explorer** playground (iframe `skill-format.html`,
   900px, with caption + "Open full-screen"), and the skill-authoring repo links.
4. **Curated mini-PRDs** — **CONDENSE**: 1–2 sentences ("LQ-AI maintains a set of curated, shortest-path
   contributions — each with explicit acceptance criteria and a contributor profile.") + a link to the
   repo's proposals/mini-PRDs. Do NOT reproduce the 7-item list with effort estimates.
5. **Before you open a PR** — **CONDENSE**: 1–2 sentences on the bar (tests + docs + reviews) + the
   `CONTRIBUTING.md` link + a "Test landscape: what must pass ↗" full-screen link to
   `test-landscape.html` (and the existing `otel-eval.html`). Do NOT reproduce exact CI commands.
6. **Anatomy of an aligned agentic flow (M4)** — port faithfully (durable + inspiring; describes how
   autonomous flows stay auditable). Normalize LQ.AI→LQ-AI.
7. **The roadmap** — port the brief roadmap summary.
8. **GitHub** — port the repo link cluster (the project, CONTRIBUTING, etc.), styled natively.

Styling: `mlq-*` tokens, the same heading/prose conventions as 2b-i (`<h2 text-lg text-mlq-strong>`,
prose `max-w-prose text-sm`). The step markup is small native flex rows (number badge + text). All
internal/dynamic `<a href>` get the `eslint-disable svelte/no-navigation-without-resolve` comment;
static external github links do not (verified in 2a/2b-i).

## Cross-links

- On `/about/lq-ai` (How It Works), add a **"How to build on LQ-AI →"** link (a small styled block) at
  the end of the page (after the Build & Learn section, before/near the GitHub link).
- On `/about/lq-ai/build`, the **"← How it works"** back-link at the top.

## Layout fix

`src/routes/(app)/about/+layout.svelte`: change `showCallout` from `pathname !== '/about/lq-ai'` to
`!pathname.startsWith('/about/lq-ai')` so the callout hides on the build sub-page too. (`wide` already
uses `startsWith('/about/lq-ai')` → build gets `max-w-6xl`, correct for the skill-format playground.)

## Testing

- **e2e** (extend `tests/about.spec.ts`): from `/about/lq-ai`, the "How to build" link reaches
  `/about/lq-ai/build`; the build page renders its `<h1>` ("Powered by LQ-AI — How to Build"), the
  **"Contribute a skill"**-area heading, and the embedded `skill-format` iframe
  (`iframe[src="/learn/playgrounds/skill-format.html"]`); the "← How it works" back-link returns to
  `/about/lq-ai`.
- Live: rebuild `donna-web`; assert `skill-format.html` + `test-landscape.html` serve 200.

## Success criteria

1. `/about/lq-ai/build` renders the curated How-to-Build content with the `skill-format` playground,
   native `mlq-*` styling, and the back-link.
2. How-It-Works ↔ How-to-Build cross-links work; the callout is hidden on both lq-ai pages.
3. Both new playgrounds serve; `npm run check` = 0/0; no new lint; `npx vitest run` green; e2e passes live.

## Out of scope

- No backend/BFF/vendor change. No change to the 16 How-It-Works sections (only the cross-link is added
  to that page).
