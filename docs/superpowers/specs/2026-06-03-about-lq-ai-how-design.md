# Powered by LQ-AI: "How It Works" (slice 2b-i) — Design Spec

**Date:** 2026-06-03 · **Slice 2b-i** of the About-page work · **Pin:** `vendor/lq-ai` @ `c22360a`
**Branch:** `feat/about-lq-ai-how` (off merged `main`).

## Goal

Replace the `/about/lq-ai` **stub** (shipped in 2a) with a real **"Powered by LQ-AI"** page that
(1) mirrors LQ-AI's "How It Works" — 16 interactive playground sections — re-skinned in Donna's
design, and (2) closes with a **Donna-authored "Build & Learn with LQ-AI"** section that suggests
what people could build on / extend / teach with the open-source LQ-AI backend.

This is the **inspire** surface: Donna showcases *one* subset of LQ-AI; this page shows the rest of
the iceberg and invites builders, students, professors, and access-to-justice orgs to do more with it.
See [[donna-about-page]], [[donna-product-direction]].

## Decisions (locked in brainstorm, 2026-06-03)
- **Re-skin natively** in Donna's `mlq-*` design (do NOT import LQ-AI's `lq-*` stylesheet).
- **Sub-sliced:** this is 2b-i = **How It Works** only. "How to Build" + its 2 playgrounds = **2b-ii**
  (a later slice; this slice adds no link to it → no dead link).
- The "Build & Learn" extra content is a **section at the END** of this page, covering **four
  audiences**: law students, law professors, developers/legal-tech builders, legal-aid/access-to-justice.

## Source material
- LQ-AI page (port from): `vendor/lq-ai/web/src/routes/lq-ai/learn/how/+page.svelte` (957 lines).
- Playgrounds (copy verbatim): `vendor/lq-ai/web/static/learn/playgrounds/*.html` — **zero-dependency,
  self-contained HTML, no external/CDN/fetch** (confirmed). The 16 used by How It Works (in order):
  `system-architecture`, `request-lifecycle`, `tier-system`, `skill-composition`,
  `citation-engine-cascade`, `anonymization-layer`, `data-residency`, `playbook-cascade`,
  `tabular-review`, `word-addin-flow`, `otel-eval`, `autonomous-flow`, `autonomous-primitives`,
  `kb-hybrid-retrieval`, `projects-org-tiers`, `intake-bridges`. (`skill-format` + `test-landscape`
  belong to How to Build → 2b-ii; not copied here.)

## Page structure (`/about/lq-ai/+page.svelte`)

1. **Intro** — keep the approved copy already in the stub ("Donna is powered by LQ-AI, an open source
   legal operating system. Donna uses some, but not all, of the functionality available in LQ-AI. You
   can learn how LQ-AI (and Donna) work below."). Drop the stub's "coming soon" paragraph.
2. **16 How-It-Works sections**, in order. Each section renders:
   - a numbered `<h2>` (e.g. "1. The big picture: System Architecture"),
   - the framing prose (ported verbatim from the LQ-AI page; 1–2 paragraphs; some sections have a short
     `lq-transition` lead-in to the next — port these as plain paragraphs or drop them, implementer's
     call for flow),
   - a lazy `<iframe src="/learn/playgrounds/<name>.html">` (height **900px**, responsive width,
     `mlq-*` border, a `title`),
   - a footer row: **"Open full-screen ↗"** (→ the same `/learn/playgrounds/<name>.html`, new tab) and
     **"Source: <path>"** (→ the LQ-AI GitHub blob URL ported from the page, new tab).
3. **"Build & Learn with LQ-AI"** — Donna-authored closing section (native prose, no iframes). A short
   lead-in ("Donna is one application built on LQ-AI. Because the whole stack is open source, here's
   what else you could build — and learn — with it.") then four labelled blocks:
   - **Power new applications** — other frontends/products on the LQ-AI backend (Donna is one example):
     e.g. a clause-library browser, a deposition-prep assistant, a compliance-checklist app, a
     litigation-timeline tool. Anchor to real surfaces (the same backend powers chat, playbooks,
     tabular, KB retrieval).
   - **Extend LQ-AI itself** — author new **skills** and **playbooks**, add a model **provider**,
     contribute to the **citation engine** / **anonymization** layers, build on the **autonomous
     primitives**. (Frame as ideas; mechanics live in 2b-ii "How to Build".)
   - **Learn & teach (law students + professors)** — students: see how legal AI actually works under
     the hood (citation verification, anonymization, RAG over contracts), and build a skill/playbook
     for a contract type as a course project; the playgrounds above are interactive explainers. The
     **tier/refusal system** is a concrete AI-governance case study. Professors: use the open codebase
     + playgrounds as teaching material for legal-AI / law-&-technology courses, set build-a-playbook
     assignments, or run a clinic customizing Donna for a real workflow.
   - **Access to justice / legal aid** — adapt the open-source stack for pro-bono and
     access-to-justice workflows where commercial tools are out of reach.
   - Close with a link to the LQ-AI GitHub repo (the project), and (later, in 2b-ii) a pointer to the
     "How to Build" page.

## Rendering approach

Keep `/about/lq-ai/+page.svelte` focused: drive the 16 sections from a typed **data array**
(`number`, `title`, `paragraphs: string[]`, `playground` filename, `sourceLabel`, `sourceUrl`,
optional `transition` string) and render them with a `{#each}`. The per-section markup may be inline
or a small `src/lib/about/LqLearnSection.svelte` presentational component (implementer's choice — pick
whichever keeps the page readable; a component is cleaner given 16 repeats). The "Build & Learn"
section is static authored markup. All styling uses `mlq-*` tokens and the same heading/prose
conventions as the 8 About topic pages (`<h1>`, `<h2 class="… text-mlq-muted">`, prose `max-w-prose`).

## Assets

Copy the 16 playground HTML files from `vendor/lq-ai/web/static/learn/playgrounds/` to
`static/learn/playgrounds/` (verbatim). SvelteKit serves `static/` at the web root, so the iframes
resolve at `/learn/playgrounds/<name>.html`. Do **not** modify the playground files. (The 2 build
playgrounds are intentionally NOT copied in this slice.)

## Testing

- **e2e** (extend `tests/about.spec.ts`): `/about/lq-ai` renders the intro, the **"1. … System
  Architecture"** section heading, at least one playground `<iframe>` (`iframe[src*="system-architecture"]`),
  and the **"Build & Learn with LQ-AI"** heading; the About callout from `/about/overview` still
  reaches `/about/lq-ai`. (Won't assert all 16 sections.)
- **iframe sanity:** assert the first iframe's `src` resolves (the static file exists / 200). The e2e
  runs against a rebuilt `donna-web`.
- **⚠️ CSP/headers risk:** verify Donna's response headers don't block same-origin iframing
  (check `hooks.server.ts` / any CSP `frame-src`). If blocked, allow same-origin frames. Confirm live —
  the e2e iframe assertion will catch a hard block.

## Success criteria

1. `/about/lq-ai` shows the intro, 16 re-skinned How-It-Works sections each with a working embedded
   playground + "Open full-screen" + "Source" links, and the "Build & Learn with LQ-AI" closing section.
2. The 16 playgrounds load (same-origin static files; no CSP block).
3. Native Donna styling (`mlq-*`); page chrome consistent with the rest of `/about`.
4. `npm run check` = 0/0; no new lint errors; `npx vitest run` green; the About e2e passes live.

## Out of scope (→ 2b-ii)
- The "How to Build" page (`vendor/.../learn/build/+page.svelte`) + its 2 playgrounds
  (`skill-format`, `test-landscape`) + the cross-link from this page to it.
