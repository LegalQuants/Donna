# Powered by LQ-AI "How It Works" (slice 2b-i) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the `/about/lq-ai` stub with a real "Powered by LQ-AI" page — 16 re-skinned "How It Works" playground sections + a Donna-authored "Build & Learn with LQ-AI" closing section.

**Architecture:** Pure-frontend SvelteKit. Copy the 16 self-contained playground HTML files into `static/` (SvelteKit serves them at `/learn/playgrounds/*.html`). Drive the sections from a typed data array (`src/lib/about/lqLearnSections.ts`) rendered by a small presentational component (`LqLearnSection.svelte`) in Donna's `mlq-*` design. The page composes intro → sections → authored "Build & Learn" block. No backend/BFF/vendor change.

**Tech Stack:** SvelteKit 2 / Svelte 5 runes, Tailwind `mlq-*` tokens, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-06-03-about-lq-ai-how-design.md`

**Note (CSP):** Donna sets no `Content-Security-Policy` / `X-Frame-Options` anywhere (verified in `src/`, `svelte.config.js`, `hooks.server.ts`), so same-origin `<iframe>`s to `/learn/playgrounds/*.html` work by default. The live e2e still asserts an iframe renders.

---

### Task 1: Copy the 16 How-It-Works playgrounds into `static/`

**Files:**
- Create: `static/learn/playgrounds/<16 files>.html` (copied verbatim)

The playgrounds are zero-dependency, self-contained HTML (no external/CDN/fetch). Copy ONLY the 16 used by How It Works (the 2 build-page ones — `skill-format`, `test-landscape` — are for 2b-ii).

- [ ] **Step 1: Copy the 16 files**

```bash
mkdir -p static/learn/playgrounds
for f in system-architecture request-lifecycle tier-system skill-composition \
  citation-engine-cascade anonymization-layer data-residency playbook-cascade \
  tabular-review word-addin-flow otel-eval autonomous-flow autonomous-primitives \
  kb-hybrid-retrieval projects-org-tiers intake-bridges; do
  cp "vendor/lq-ai/web/static/learn/playgrounds/$f.html" "static/learn/playgrounds/$f.html"
done
ls static/learn/playgrounds/ | wc -l   # expect 16
```

- [ ] **Step 2: Verify the count and that files are non-empty**

Run: `ls -l static/learn/playgrounds/ | grep -c '\.html'`
Expected: `16`. Spot-check one is non-trivial: `wc -l static/learn/playgrounds/system-architecture.html` (hundreds of lines).

- [ ] **Step 3: Commit**

```bash
git add static/learn/playgrounds/
git commit -m "feat(about): copy 16 LQ-AI How-It-Works playgrounds into static/"
```

---

### Task 2: Section data array + type (`lqLearnSections.ts`)

Transcribe the 16 sections from the LQ-AI source into a typed data array. Source to read:
`vendor/lq-ai/web/src/routes/lq-ai/learn/how/+page.svelte`. For each `<section class="lq-how-section">`
port: the `<h2>` text (number + title), the framing `<p class="lq-text-body">` prose, the iframe's
playground filename, and the footer "Source:" GitHub URL + its visible label. **Normalize "LQ.AI" →
"LQ-AI"** in ported prose for consistency with Donna's copy. Drop the inter-section
`lq-transition` lead-ins (they reference "the next playground" and don't survive re-skinning) — keep
each section's own framing paragraph(s) only.

**Files:**
- Create: `src/lib/about/lqLearnSections.ts`
- Test: `src/lib/about/lqLearnSections.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest';
import { lqLearnSections } from './lqLearnSections';

const PLAYGROUNDS = [
  'system-architecture', 'request-lifecycle', 'tier-system', 'skill-composition',
  'citation-engine-cascade', 'anonymization-layer', 'data-residency', 'playbook-cascade',
  'tabular-review', 'word-addin-flow', 'otel-eval', 'autonomous-flow', 'autonomous-primitives',
  'kb-hybrid-retrieval', 'projects-org-tiers', 'intake-bridges'
];

describe('lqLearnSections', () => {
  it('has the 16 How-It-Works sections in order with the expected playgrounds', () => {
    expect(lqLearnSections).toHaveLength(16);
    expect(lqLearnSections.map((s) => s.playground)).toEqual(PLAYGROUNDS);
    lqLearnSections.forEach((s, i) => {
      expect(s.number).toBe(i + 1);
      expect(s.title.length).toBeGreaterThan(0);
      expect(s.paragraphs.length).toBeGreaterThan(0);
      expect(s.paragraphs.every((p) => p.trim().length > 0)).toBe(true);
      expect(s.sourceUrl).toMatch(/^https:\/\/github\.com\/LegalQuants\/lq-ai/);
      expect(s.sourceLabel.length).toBeGreaterThan(0);
    });
  });

  it('does not leak the "LQ.AI" dotted spelling (normalized to LQ-AI)', () => {
    for (const s of lqLearnSections) {
      for (const p of s.paragraphs) expect(p).not.toMatch(/LQ\.AI/);
    }
  });
});
```

- [ ] **Step 2: Run it, verify it fails**

Run: `npx vitest run src/lib/about/lqLearnSections.test.ts` → FAIL (module missing).

- [ ] **Step 3: Create the file** — the type + the 16-entry array. Section 1 is shown fully as the
exact pattern; transcribe sections 2–16 the same way from the LQ-AI source (titles below are the
verified headings; fill `paragraphs` + `sourceLabel`/`sourceUrl` from the source per section).

```ts
export type LqLearnSection = {
  number: number;
  title: string;          // without the leading number, e.g. "The big picture: System Architecture"
  paragraphs: string[];   // framing prose, ported verbatim (LQ.AI → LQ-AI), one entry per <p>
  playground: string;     // filename stem under /learn/playgrounds/<playground>.html
  sourceLabel: string;    // visible link text, e.g. "docs/architecture.md"
  sourceUrl: string;      // the GitHub blob URL
};

export const lqLearnSections: LqLearnSection[] = [
  {
    number: 1,
    title: 'The big picture: System Architecture',
    paragraphs: [
      'LQ-AI is three services: the FastAPI backend (api/), the Inference Gateway (gateway/), and the SvelteKit web frontend (web/). They communicate over HTTP using OpenAPI-defined contracts; no service shares in-process code with another. The Gateway is the security boundary — the only component that holds provider API keys and makes outbound inference calls. This map shows the service topology, the network boundaries, and the trust model.'
    ],
    playground: 'system-architecture',
    sourceLabel: 'docs/architecture.md',
    sourceUrl: 'https://github.com/LegalQuants/lq-ai/blob/main/docs/architecture.md'
  },
  // 2–16: transcribe from vendor/lq-ai/web/src/routes/lq-ai/learn/how/+page.svelte, same shape.
  // Verified titles + playgrounds (fill paragraphs + sourceLabel/sourceUrl from the source):
  //  2  "A request, end to end: Lifecycle of a chat send"            request-lifecycle
  //  3  "The tier system: when the Gateway says no"                  tier-system
  //  4  "What the model actually sees: Skill Composition"            skill-composition
  //  5  "Verifying what the model said: Citation Engine cascade"     citation-engine-cascade
  //  6  "Confidentiality: Anonymization Layer pre/post"              anonymization-layer
  //  7  "Where your data lives: Data Residency"                      data-residency
  //  8  "Reviewing a contract: the Playbook execution cascade"       playbook-cascade
  //  9  "Comparing many contracts: the Tabular Review grid"          tabular-review
  // 10  "Into the editor: the Word add-in install + auth flow"       word-addin-flow
  // 11  "Seeing it all at once: the observability trace"             otel-eval
  // 12  "Autonomy you can audit: the Autonomous flow"                autonomous-flow
  // 13  "The four autonomous primitives: watches, schedules, memory, precedent"  autonomous-primitives
  // 14  "Finding the right chunks: knowledge-base hybrid retrieval"  kb-hybrid-retrieval
  // 15  "The matter's context: projects, org profile, and tier floors"  projects-org-tiers
  // 16  "Getting work in: the Slack/Teams intake bridges"            intake-bridges
];
```

> The `title` omits the leading "N." — the component prepends the number. Strip "N. " from the source headings when transcribing.

- [ ] **Step 4: Run the test → PASS**

Run: `npx vitest run src/lib/about/lqLearnSections.test.ts` (16 sections, no `LQ.AI` leak).

- [ ] **Step 5: `npm run check`** (0/0).

- [ ] **Step 6: Commit**

```bash
git add src/lib/about/lqLearnSections.ts src/lib/about/lqLearnSections.test.ts
git commit -m "feat(about): LQ-AI How-It-Works section data (16 sections, ported prose)"
```

---

### Task 3: `LqLearnSection.svelte` presentational component

Renders one section: numbered heading, prose, the playground iframe, and the foot links.

**Files:**
- Create: `src/lib/about/LqLearnSection.svelte`
- Test: `src/lib/about/LqLearnSection.svelte.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import LqLearnSection from './LqLearnSection.svelte';
import type { LqLearnSection as Section } from './lqLearnSections';

const section: Section = {
  number: 1,
  title: 'The big picture: System Architecture',
  paragraphs: ['First para.', 'Second para.'],
  playground: 'system-architecture',
  sourceLabel: 'docs/architecture.md',
  sourceUrl: 'https://github.com/LegalQuants/lq-ai/blob/main/docs/architecture.md'
};

describe('LqLearnSection', () => {
  it('renders the numbered heading, prose, iframe, and foot links', () => {
    const { container } = render(LqLearnSection, { props: { section } as never });
    expect(screen.getByRole('heading', { name: '1. The big picture: System Architecture', level: 2 })).toBeInTheDocument();
    expect(screen.getByText('First para.')).toBeInTheDocument();
    expect(screen.getByText('Second para.')).toBeInTheDocument();

    const iframe = container.querySelector('iframe')!;
    expect(iframe.getAttribute('src')).toBe('/learn/playgrounds/system-architecture.html');
    expect(iframe.getAttribute('loading')).toBe('lazy');
    expect(iframe.getAttribute('title')).toContain('System Architecture');

    const full = screen.getByRole('link', { name: /open full-screen/i });
    expect(full.getAttribute('href')).toBe('/learn/playgrounds/system-architecture.html');
    const source = screen.getByRole('link', { name: 'docs/architecture.md' });
    expect(source.getAttribute('href')).toBe(section.sourceUrl);
  });
});
```

- [ ] **Step 2: Run it, verify it fails**

Run: `npx vitest run src/lib/about/LqLearnSection.svelte.test.ts` → FAIL (component missing).

- [ ] **Step 3: Create the component**

```svelte
<script lang="ts">
  import type { LqLearnSection } from './lqLearnSections';
  let { section }: { section: LqLearnSection } = $props();
  const playgroundHref = $derived(`/learn/playgrounds/${section.playground}.html`);
</script>

<section class="mb-10">
  <h2 class="mb-2 text-lg font-medium text-mlq-strong">{section.number}. {section.title}</h2>
  {#each section.paragraphs as p (p)}
    <p class="mb-3 max-w-prose text-sm leading-relaxed text-mlq-text">{p}</p>
  {/each}
  <iframe
    src={playgroundHref}
    title="{section.title} — interactive"
    loading="lazy"
    class="mt-2 h-[900px] w-full rounded-mlq-control border border-mlq-subtle"
  ></iframe>
  <div class="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-mlq-muted">
    <!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- external static playground -->
    <a href={playgroundHref} target="_blank" rel="noopener noreferrer" class="text-mlq-strong hover:underline">Open full-screen ↗</a>
    <span>
      Source:
      <!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- external github link -->
      <a href={section.sourceUrl} target="_blank" rel="noopener noreferrer" class="text-mlq-strong hover:underline">{section.sourceLabel}</a>
    </span>
  </div>
</section>
```

- [ ] **Step 4: Run the test → PASS**

Run: `npx vitest run src/lib/about/LqLearnSection.svelte.test.ts`.

- [ ] **Step 5: `npm run check`** (0/0) and `npx eslint src/lib/about/LqLearnSection.svelte` (clean).

- [ ] **Step 6: Commit**

```bash
git add src/lib/about/LqLearnSection.svelte src/lib/about/LqLearnSection.svelte.test.ts
git commit -m "feat(about): LqLearnSection component (heading + prose + playground iframe + links)"
```

---

### Task 4: Wire the page — intro + 16 sections

Replace the stub body of `/about/lq-ai/+page.svelte` with the intro (kept) + the `{#each}` of sections.
(The "Build & Learn" section is appended in Task 5.)

**Files:**
- Modify: `src/routes/(app)/about/lq-ai/+page.svelte`

- [ ] **Step 1: Replace the page body**

Current file is the 2a stub (`<h1>Powered by LQ-AI</h1>` + intro `<p>` + a "coming soon" `<p>`).
Replace its entire contents with:

```svelte
<script lang="ts">
  import { lqLearnSections } from '$lib/about/lqLearnSections';
  import LqLearnSection from '$lib/about/LqLearnSection.svelte';
</script>

<svelte:head><title>Powered by LQ-AI — About Donna</title></svelte:head>

<h1 class="mb-4 text-xl font-medium text-mlq-text">Powered by LQ-AI</h1>

<p class="mb-3 max-w-prose text-sm leading-relaxed text-mlq-text">
  Donna is powered by LQ-AI, an open source legal operating system. Donna uses some, but not all, of
  the functionality available in LQ-AI. The interactive surfaces below walk through how LQ-AI (and
  Donna) work, from a request to a verified, cited answer.
</p>

<div class="mt-8">
  {#each lqLearnSections as section (section.number)}
    <LqLearnSection {section} />
  {/each}
</div>
```

- [ ] **Step 2: `npm run check`** (0/0) and `npx eslint "src/routes/(app)/about/lq-ai/+page.svelte"` (clean) and `npx vitest run` (green — no regressions).

- [ ] **Step 3: Commit**

```bash
git add "src/routes/(app)/about/lq-ai/+page.svelte"
git commit -m "feat(about): render the 16 How-It-Works sections on /about/lq-ai"
```

---

### Task 5: Author the "Build & Learn with LQ-AI" closing section

Append a Donna-authored section to `/about/lq-ai/+page.svelte` (after the `{#each}` `</div>`). Static
authored prose grounded in real surfaces — **do not invent LQ-AI features**; anchor to things that
actually exist (skills, playbooks, tabular, KB retrieval, the citation engine, the tier/refusal system,
the playgrounds above).

**Files:**
- Modify: `src/routes/(app)/about/lq-ai/+page.svelte`

- [ ] **Step 1: Append the section**

After the sections `</div>` (and before end of file), add the block below. Write genuine, useful prose
in each `<p>`/`<li>` — the structure and lead sentences are given; expand each with 1–3 concrete,
accurate items. Keep Donna's heading/prose conventions and `mlq-*` tokens.

```svelte
<section class="mt-12 border-t border-mlq-subtle pt-8">
  <h2 class="mb-3 text-lg font-medium text-mlq-strong">Build &amp; learn with LQ-AI</h2>
  <p class="mb-5 max-w-prose text-sm leading-relaxed text-mlq-text">
    Donna is one application built on LQ-AI. Because the whole stack is open source, here is some of
    what else you could build — and teach — with it.
  </p>

  <h3 class="mb-2 text-sm font-medium uppercase tracking-wide text-mlq-muted">Power new applications</h3>
  <p class="mb-2 max-w-prose text-sm leading-relaxed text-mlq-text">
    The same backend that powers Donna's chat, playbooks, tabular review, and knowledge retrieval can
    front entirely different products. <!-- expand: e.g. a clause-library browser, a deposition-prep
    assistant, a compliance-checklist app, a litigation-timeline tool — each a thin frontend over the
    LQ-AI API, like Donna. -->
  </p>

  <h3 class="mb-2 mt-5 text-sm font-medium uppercase tracking-wide text-mlq-muted">Extend LQ-AI itself</h3>
  <p class="mb-2 max-w-prose text-sm leading-relaxed text-mlq-text">
    <!-- expand: author new skills and playbooks, add a model provider, contribute to the citation
    engine or anonymization layers, or build on the autonomous primitives. The mechanics live in the
    project's contributor guide. -->
  </p>

  <h3 class="mb-2 mt-5 text-sm font-medium uppercase tracking-wide text-mlq-muted">Learn &amp; teach</h3>
  <p class="mb-2 max-w-prose text-sm leading-relaxed text-mlq-text">
    For <strong>law students</strong>: <!-- expand: see how legal AI actually works under the hood —
    citation verification, anonymization, RAG over contracts — using the interactive playgrounds above;
    build a skill or playbook for a contract type as a course project; study the tier/refusal system as
    a concrete AI-governance example. -->
  </p>
  <p class="mb-2 max-w-prose text-sm leading-relaxed text-mlq-text">
    For <strong>law professors</strong>: <!-- expand: use the open codebase and playgrounds as teaching
    material for a legal-AI / law-and-technology course; set a build-a-playbook assignment; run a clinic
    that customizes Donna for a real legal-aid workflow. -->
  </p>

  <h3 class="mb-2 mt-5 text-sm font-medium uppercase tracking-wide text-mlq-muted">Access to justice</h3>
  <p class="mb-4 max-w-prose text-sm leading-relaxed text-mlq-text">
    <!-- expand: because it's open source and can run on local models, the stack can be adapted for
    pro-bono and access-to-justice workflows where commercial tools are out of reach. -->
  </p>

  <p class="max-w-prose text-sm text-mlq-muted">
    Explore the project:
    <a href="https://github.com/LegalQuants/lq-ai" target="_blank" rel="noopener noreferrer" class="font-medium text-mlq-strong underline">LegalQuants / lq-ai on GitHub</a>.
  </p>
</section>
```

Replace each `<!-- expand: … -->` comment with real authored prose (or a `<ul class="mb-3 ml-4
list-disc space-y-1 text-sm text-mlq-text">` list) along the lines indicated. The external GitHub
`<a>` needs **no** eslint-disable (the rule only targets internal navigation — verified in slice 2a).

- [ ] **Step 2: `npm run check`** (0/0) and `npx eslint "src/routes/(app)/about/lq-ai/+page.svelte"` (clean).

- [ ] **Step 3: Commit**

```bash
git add "src/routes/(app)/about/lq-ai/+page.svelte"
git commit -m "feat(about): Build & Learn with LQ-AI closing section"
```

---

### Task 6: e2e + live verification

**Files:**
- Modify: `tests/about.spec.ts`

- [ ] **Step 1: Replace the lq-ai callout test with a fuller one**

The 2a test `'the Powered by LQ-AI callout reaches the lq-ai page'` asserts only the intro. Replace its
body (keep the test name or rename) so it also checks a section + an iframe + the Build & Learn heading:

```ts
test('the Powered by LQ-AI page renders How-It-Works sections + Build & Learn', async ({ page }) => {
  await login(page);
  await page.goto('/about/overview');

  await page.getByRole('link', { name: /powered by/i }).click();
  await expect(page).toHaveURL(/\/about\/lq-ai$/);
  await expect(page.getByRole('heading', { name: 'Powered by LQ-AI', level: 1 })).toBeVisible();

  // A How-It-Works section + its embedded playground iframe.
  await expect(page.getByRole('heading', { name: '1. The big picture: System Architecture', level: 2 })).toBeVisible();
  await expect(page.locator('iframe[src="/learn/playgrounds/system-architecture.html"]')).toHaveCount(1);

  // The authored closing section.
  await expect(page.getByRole('heading', { name: /Build & learn with LQ-AI/i, level: 2 })).toBeVisible();
});
```

- [ ] **Step 2: `npm run check`** (0/0).

- [ ] **Step 3: Commit**

```bash
git add tests/about.spec.ts
git commit -m "test(about): e2e — /about/lq-ai renders sections, a playground iframe, Build & Learn"
```

- [ ] **Step 4: Live verification (controller-run)**

```bash
set -a; . ./.env; set +a
docker compose up -d --build donna-web        # serves built code incl. the new static/ assets
# wait for healthy, then:
npx playwright test about.spec.ts              # all About specs incl. the new one
```
Expected: green. Also spot-check in a browser that `http://localhost:13002/learn/playgrounds/system-architecture.html` loads (static asset served) and that an embedded playground renders inside `/about/lq-ai` (no CSP block).

---

## Notes for the executor

- **Gate bar:** `npm run check` = 0/0 is THE bar. Don't add NEW eslint errors — internal `<a href>`
  need the `<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->` comment; external
  `https://` links do NOT (verified in 2a). The playground iframes are same-origin (`/learn/...`) — no
  CSP exists to block them.
- **Do not** modify the copied playground HTML files or any `vendor/` / backend code.
- **Accuracy:** Task 2 prose is ported from the LQ-AI page (it's about LQ-AI — correct for this page).
  Task 5 prose is authored — keep it grounded in real surfaces; don't promise Donna features that don't
  exist (this page is about LQ-AI's full capability, framed as "what you could build", which is fine).
- **Scope:** no "How to Build" page or its 2 playgrounds (that's 2b-ii); no cross-link to it here.
- After execution: whole-branch Opus review, then `finishing-a-development-branch` → PR.
