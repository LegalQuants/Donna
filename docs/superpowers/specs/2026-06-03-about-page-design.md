# About page (slice 2a) — Design Spec

**Date:** 2026-06-03 · **Slice 2a** of the About-page work · **Pin:** `vendor/lq-ai` @ `c22360a`

## Goal

Add an **"About"** entry to the left sidebar (just above Settings) that opens a comprehensive,
instructional **"About Donna"** guide — what Donna can do and how to use each feature in the
frontend — structured as a left-rail + page-per-topic surface (mirroring `/settings`). At the top
of the About area sits a **"Powered by LQ-AI — Learn how it works →"** callout linking to
`/about/lq-ai`, which ships in this slice as a minimal stub (intro + link to the LQ-AI repo) and is
expanded into the full LQ-AI mirror in **slice 2b**.

This reinforces Donna = a friendly frontend showcasing one subset of the open-source LQ-AI backend,
and gives users a real onboarding/education surface. See [[donna-about-page]],
[[donna-product-direction]].

## Scope

**In scope (slice 2a):**
- Sidebar "About" entry above Settings.
- `/about` route group: layout + rail + redirect + 8 topic pages.
- The "Powered by LQ-AI" callout banner + a minimal `/about/lq-ai` stub page.
- A Playwright e2e covering navigation and the callout link.

**Out of scope (→ slice 2b):** the full LQ-AI "How It Works" (16 sections) + "How to Build" port,
and the 18 static playgrounds. Slice 2b replaces the `/about/lq-ai` stub.

## Architecture / IA

Mirror the existing `/settings` pattern (`+layout.svelte` + a rail component + a redirecting
`+page.server.ts`), so the page chrome is native to Donna.

### Routes (all under `src/routes/(app)/about/`)

| File | Responsibility |
| --- | --- |
| `+page.server.ts` | `redirect(307, '/about/overview')` — `/about` has no page of its own (mirrors `settings/+page.server.ts`). |
| `+layout.svelte` | Two-column shell in a `max-w-3xl` container: the "Powered by LQ-AI" callout banner at the top, then `<AboutRail />` + `{@render children()}`. Mirrors `settings/+layout.svelte`. |
| `overview/+page.svelte` | "What Donna is" — friendly frontend over LQ-AI; orientation + how the guide is organized. |
| `assistant/+page.svelte` | The Assistant/landing + in-chat composer: sending messages, prompt-enhance (✦), attaching skills & files, model picker, citations/receipts at a glance. |
| `projects/+page.svelte` | Projects (matters): creating a matter, privilege/anonymization, attaching files, scoping chats to a matter. |
| `workflows/+page.svelte` | Workflows hub: skills (authoring/forking, inputs), playbooks (browse/apply/author), saved prompts. |
| `tabular/+page.svelte` | Tabular review: building a table over documents, columns/tiers, running, cell → source citation navigation, history/resume. |
| `knowledge/+page.svelte` | Knowledge bases: creating a KB, uploading documents (note: `.pdf` ingests; some types unsupported), how RAG retrieval is used in answers. |
| `models/+page.svelte` | Models: the in-composer model picker and `/settings/models` per-category routing + installed local models. |
| `trust/+page.svelte` | Trust & citations: anonymization, the receipts drawer / citation pills, "answers are not legal advice." |
| `lq-ai/+page.svelte` | **Stub** (this slice): the intro paragraph + a prominent link to the LQ-AI open-source repo/site. Replaced in slice 2b. |

### Components

- `src/lib/about/AboutRail.svelte` — left rail listing the 8 topics, active-route highlighting via
  `page.url.pathname === href || page.url.pathname.startsWith(href + '/')` (mirrors
  `src/lib/settings/SettingsRail.svelte`). The rail lists only the 8 Donna topics; the LQ-AI page is
  reached via the callout, not the rail.
- The callout banner lives in `about/+layout.svelte` (not a separate component — it is a single
  styled `<a href="/about/lq-ai">` block), so it appears atop every About page.

### Sidebar entry

In `src/lib/components/Sidebar.svelte`: import the lucide `Info` icon; add a hardcoded `<a
href="/about">` block in the footer `<div>` immediately **above** the Settings link, using the same
markup/classes as the Settings link, with active state when `page.url.pathname.startsWith('/about')`.

## Content approach

Each topic page is **rich instructional prose + on-screen UI references, no screenshots** (durable,
low-maintenance). Content must be **accurate to the real feature** — each page's implementer reads
the actual components/routes before writing:

- Assistant → `src/lib/components/Composer.svelte`, `src/lib/enhance/`, citations/receipts
  (`ReceiptsDrawer.svelte`, citation pills), the landing `(app)/+page.svelte` and in-chat
  `(app)/chats/[id]/+page.svelte`.
- Projects → `src/routes/(app)/matters/`, `src/lib/matters/` (privilege/badges).
- Workflows → `src/routes/(app)/{skills,playbooks,prompts}/`, `src/lib/skills/`, `src/lib/prompts/`.
- Tabular → `src/routes/(app)/tabular/`, `src/lib/` tabular components.
- Knowledge → `src/routes/(app)/knowledge/`, `src/lib/knowledge/`.
- Models → `src/routes/(app)/settings/models/`, `src/lib/inference/`, `src/lib/models/`.
- Trust → anonymization indicators, `ReceiptsDrawer.svelte`, the "not legal advice" notice.

Styling: Donna design tokens (`mlq-text`, `mlq-muted`, `mlq-strong`, `mlq-subtle`,
`rounded-mlq-control`). Page headers follow the settings sub-page convention
(`<h1 class="text-xl font-medium text-mlq-text">` + a `mlq-muted` subhead). Use semantic structure
(`<h2>`, lists, `<details>` foldouts where helpful). Each page sets a `<svelte:head><title>` like the
settings pages (e.g. `Assistant — About Donna`).

## Testing

A Playwright spec `tests/about.spec.ts` (follow the repo's e2e conventions — see
`tests/model-settings.spec.ts`, the `login()` helper, `DONNA_BASE_URL`):
1. After login, the sidebar shows an **About** link, positioned **above** Settings.
2. Clicking About lands on `/about/overview` (the `/about` redirect resolves).
3. The rail navigates: clicking another topic (e.g. Tabular) routes to `/about/tabular` and marks it
   active (`aria-current="page"`).
4. The "Powered by LQ-AI" callout links to `/about/lq-ai`; the stub page renders the intro text.

Rebuild `donna-web` before running the live e2e (it serves built code).

## Success criteria

1. "About" appears in the sidebar above Settings and is active on any `/about/*` route.
2. `/about` redirects to `/about/overview`; all 8 topic pages render with accurate, instructional
   content and native styling.
3. The rail navigates between topics with correct active highlighting.
4. The "Powered by LQ-AI" callout reaches the `/about/lq-ai` stub, which shows the intro + LQ-AI repo link.
5. `npm run check` = 0 errors / 0 warnings; no new lint errors; `npx vitest run` green; `about.spec.ts` passes live.

## Notes

- This slice is content-heavy but mechanically simple (static Svelte pages + one rail + one sidebar
  edit + one e2e). No backend, BFF, or vendor change.
- The `/about/lq-ai` stub is intentionally minimal so slice 2a ships a working, dead-link-free surface;
  slice 2b expands it.
