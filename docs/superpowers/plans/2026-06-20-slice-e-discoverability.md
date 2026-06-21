# Slice E — Discoverability & in-app guidance — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the legal-research + MCP features understandable at the moment of encounter — plain-language explainers and clickable starters on each surface — plus two `/about` guide pages.

**Architecture:** Pure frontend, no backend/contract change. Two small reusable Svelte 5 components carry the clickable starters (`ResearchStarters`, `ComposerStarters`) and are unit-tested in isolation; the rest is in-context copy added to existing pages and two new prose `/about` pages wired into the About rail.

**Tech Stack:** SvelteKit 2 / Svelte 5 runes, TypeScript, Vitest + `@testing-library/svelte`, Playwright e2e, Tailwind (`mlq-*` tokens).

## Global Constraints

- **Never edit `vendor/lq-ai`.** No backend/API work in this slice.
- **Bar is green:** `npm run check` = 0 errors / 0 warnings (a harmless `ERR_MODULE_NOT_FOUND` vendor/lq-ai line prints then recovers — only the final `0 ERRORS 0 WARNINGS` counts); `npm run lint` = prettier + eslint fully clean; `npx vitest run` passes. Run all three before claiming a task done.
- **Tabs for indentation** (prettier-enforced) — copy a neighboring file's style.
- **Svelte 5 runes** (`$props`, `$state`, `$derived`).
- **Plain-language copy, verbatim** from this plan (it is the "dead simple" deliverable). Match each page's existing `mlq-*` token chrome.
- **The "try this" starters never auto-submit and never bypass any gate** — they only set local input state.
- **Do NOT weaken `eslint.config.js`** to dodge a test type error — cast at the call site.
- **Commit per task.** Conventional-commit messages end with the `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>` trailer.
- Prettier can be non-idempotent on markdown with embedded code fences; if `npm run lint` flags a `.md` file you touched, run `npx prettier --write <file>` and re-check.

---

## File Structure

- Create `src/lib/research/ResearchStarters.svelte` — intro paragraph + 3 clickable example-query chips; prop `onpick`.
- Create `src/lib/research/ResearchStarters.svelte.test.ts` — render + click test.
- Modify `src/routes/(app)/research/+page.svelte` — render `ResearchStarters` pre-search; wire `onpick`.
- Create `src/lib/components/ComposerStarters.svelte` — "Try:" row with an example prompt; prop `onpick`.
- Create `src/lib/components/ComposerStarters.svelte.test.ts` — render + click test.
- Modify `src/routes/(app)/+page.svelte` — render `ComposerStarters` when the composer is empty.
- Modify `src/routes/(app)/settings/mcp/+page.svelte` — explainer card.
- Modify `src/routes/(app)/settings/connections/+page.svelte` — explainer card.
- Modify `src/lib/components/Message.svelte` — Approve/Deny helper line.
- Modify `src/lib/components/ToolSourcesPanel.svelte` — "what this is" subtitle.
- Modify `src/lib/components/ToolSourcesPanel.svelte.test.ts` — assert the subtitle.
- Create `src/routes/(app)/about/research/+page.svelte` — Research guide page.
- Create `src/routes/(app)/about/tools/+page.svelte` — Tools & connections guide page.
- Modify `src/lib/about/AboutRail.svelte` — add two links.
- Create `src/lib/about/AboutRail.svelte.test.ts` — assert the two new links.
- Modify `src/routes/(app)/about/overview/+page.svelte` — mention Research + Tools.
- Create `tests/discoverability.spec.ts` — live e2e.

---

## Task 1: Research starters (component + wire into the Research page)

**Files:**

- Create: `src/lib/research/ResearchStarters.svelte`
- Test: `src/lib/research/ResearchStarters.svelte.test.ts`
- Modify: `src/routes/(app)/research/+page.svelte`

**Interfaces:**

- Produces: `ResearchStarters` — `{ onpick }: { onpick: (q: string) => void }`. Renders the intro copy + 3 chip buttons; clicking a chip calls `onpick(queryText)`.

**Context:** The Research page (`research/+page.svelte`) uses a store `const r = createResearch()` with `r.search(q, { court, order_by })`, `r.loading`, and `r.count` (which is `null` until the first search — see line 76 `r.count !== null`). Page state: `let q`, `let court`, `let orderBy`. Show the starters only pre-search: `r.count === null && !r.loading`.

- [ ] **Step 1: Write the failing component test**

```ts
// src/lib/research/ResearchStarters.svelte.test.ts
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import ResearchStarters from './ResearchStarters.svelte';

describe('ResearchStarters', () => {
	it('renders the plain-language intro and example query chips', () => {
		render(ResearchStarters, { onpick: () => {} });
		expect(screen.getByText(/Search U\.S\. case law/i)).toBeInTheDocument();
		expect(screen.getByRole('button', { name: 'Chevron deference' })).toBeInTheDocument();
		expect(screen.getByRole('button', { name: 'Brown v. Board of Education' })).toBeInTheDocument();
		expect(screen.getByRole('button', { name: 'qualified immunity' })).toBeInTheDocument();
	});

	it('calls onpick with the chip text when a chip is clicked', async () => {
		const onpick = vi.fn();
		render(ResearchStarters, { onpick });
		await screen.getByRole('button', { name: 'Chevron deference' }).click();
		expect(onpick).toHaveBeenCalledWith('Chevron deference');
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/research/ResearchStarters.svelte.test.ts`
Expected: FAIL — component module missing.

- [ ] **Step 3: Write the component**

```svelte
<!-- src/lib/research/ResearchStarters.svelte -->
<script lang="ts">
	let { onpick }: { onpick: (q: string) => void } = $props();
	const EXAMPLES = ['Chevron deference', 'Brown v. Board of Education', 'qualified immunity'];
</script>

<div class="mt-5 rounded-mlq-control border border-mlq-subtle bg-mlq-surface-alt/40 p-4">
	<p class="max-w-prose text-sm text-mlq-text">
		<strong>Search U.S. case law.</strong> Donna looks up court opinions from CourtListener. Search
		by topic or case name, click a result to read the full opinion, and use
		<strong>Verify citations</strong>
		to check quoted text against the source.
	</p>
	<div class="mt-3 flex flex-wrap gap-2">
		<span class="text-xs text-mlq-muted">Try:</span>
		{#each EXAMPLES as ex (ex)}
			<button
				type="button"
				onclick={() => onpick(ex)}
				class="rounded-full border border-mlq-subtle px-2.5 py-0.5 text-xs text-mlq-text hover:bg-mlq-surface-alt"
				>{ex}</button
			>
		{/each}
	</div>
</div>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/research/ResearchStarters.svelte.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Wire it into the Research page**

In `src/routes/(app)/research/+page.svelte`: add the import beside the others in `<script>`:

```ts
import ResearchStarters from '$lib/research/ResearchStarters.svelte';
```

Then, inside the `{:else}` (enabled) branch, immediately AFTER the `</form>` (the search form ends at line 69) and BEFORE the `{#if r.error}` line, add:

```svelte
{#if r.count === null && !r.loading}
	<ResearchStarters
		onpick={(query) => {
			q = query;
			r.search(query, { court, order_by: orderBy });
		}}
	/>
{/if}
```

- [ ] **Step 6: Gate + commit**

```bash
npm run check && npm run lint && npx vitest run src/lib/research/
git add src/lib/research/ResearchStarters.svelte src/lib/research/ResearchStarters.svelte.test.ts "src/routes/(app)/research/+page.svelte"
git commit -m "feat(research): plain-language intro + clickable starter searches (Slice E)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: Composer "try this" starter (component + wire into the landing page)

**Files:**

- Create: `src/lib/components/ComposerStarters.svelte`
- Test: `src/lib/components/ComposerStarters.svelte.test.ts`
- Modify: `src/routes/(app)/+page.svelte`

**Interfaces:**

- Produces: `ComposerStarters` — `{ onpick }: { onpick: (text: string) => void }`. Renders a "Try:" row with one example prompt; clicking calls `onpick(promptText)`.

**Context:** The landing page (`(app)/+page.svelte`) has `let message = $state('')` bound into `<Composer bind:value={message} … />` inside a `<form>` that ends at line 52. Setting `message` fills the composer; we do NOT submit.

- [ ] **Step 1: Write the failing component test**

```ts
// src/lib/components/ComposerStarters.svelte.test.ts
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import ComposerStarters from './ComposerStarters.svelte';

describe('ComposerStarters', () => {
	it('renders an example case-law prompt', () => {
		render(ComposerStarters, { onpick: () => {} });
		expect(screen.getByText(/^Try:/i)).toBeInTheDocument();
		expect(
			screen.getByRole('button', { name: /landmark U\.S\. Supreme Court case on free speech/i })
		).toBeInTheDocument();
	});

	it('calls onpick with the prompt text when clicked', async () => {
		const onpick = vi.fn();
		render(ComposerStarters, { onpick });
		await screen
			.getByRole('button', { name: /landmark U\.S\. Supreme Court case on free speech/i })
			.click();
		expect(onpick).toHaveBeenCalledWith(
			'Find a landmark U.S. Supreme Court case on free speech and cite it'
		);
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/components/ComposerStarters.svelte.test.ts`
Expected: FAIL — component module missing.

- [ ] **Step 3: Write the component**

```svelte
<!-- src/lib/components/ComposerStarters.svelte -->
<script lang="ts">
	import { Scale } from '@lucide/svelte';
	let { onpick }: { onpick: (text: string) => void } = $props();
	const PROMPTS = ['Find a landmark U.S. Supreme Court case on free speech and cite it'];
</script>

<div class="mt-4 flex flex-wrap items-center justify-center gap-2 text-xs text-mlq-muted">
	<span>Try:</span>
	{#each PROMPTS as p (p)}
		<button
			type="button"
			onclick={() => onpick(p)}
			class="inline-flex items-center gap-1 rounded-full border border-mlq-subtle px-2.5 py-0.5 text-mlq-text hover:bg-mlq-surface-alt"
		>
			<Scale size={12} aria-hidden="true" />
			{p}
		</button>
	{/each}
</div>
```

(Note: the visible chip text is the prompt; the `⚖` from the spec is rendered as the `Scale` icon, consistent with the sources pill in `Message.svelte`.)

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/components/ComposerStarters.svelte.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Wire it into the landing page**

In `src/routes/(app)/+page.svelte`: add the import beside the others in `<script>`:

```ts
import ComposerStarters from '$lib/components/ComposerStarters.svelte';
```

Then, immediately AFTER the `</form>` (ends at line 52) and BEFORE the `{#if form?.error}` line, add:

```svelte
{#if message.trim() === ''}
	<ComposerStarters onpick={(t) => (message = t)} />
{/if}
```

- [ ] **Step 6: Gate + commit**

```bash
npm run check && npm run lint && npx vitest run src/lib/components/ComposerStarters.svelte.test.ts
git add src/lib/components/ComposerStarters.svelte src/lib/components/ComposerStarters.svelte.test.ts "src/routes/(app)/+page.svelte"
git commit -m "feat(chat): example case-law prompt on the landing composer (Slice E)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: MCP + Connections explainer cards (copy)

**Files:**

- Modify: `src/routes/(app)/settings/mcp/+page.svelte`
- Modify: `src/routes/(app)/settings/connections/+page.svelte`

**Context:** Static copy only — no test (covered by `svelte-check`/lint + the Task 8 e2e). Match the existing muted-card chrome.

- [ ] **Step 1: MCP explainer**

In `src/routes/(app)/settings/mcp/+page.svelte`, immediately AFTER the subtitle `<p>` (the "Model Context Protocol servers your operator has connected…" paragraph, ends line 14) and BEFORE the `{#if data.servers.some(...)}` OAuth-hint block, add:

```svelte
<div
	class="mt-3 rounded-mlq-control border border-mlq-subtle bg-mlq-surface-alt/40 p-3 text-xs text-mlq-text"
>
	<strong>What this is.</strong> MCP servers are collections of external tools your operator connects
	— for example, documentation or reference lookups. Tools you enable here become available to the assistant
	in chat, and it always asks your permission before running one.
</div>
```

- [ ] **Step 2: Connections explainer**

In `src/routes/(app)/settings/connections/+page.svelte`, immediately AFTER the subtitle `<p>` (the "Connect your account to the OAuth-protected MCP tool servers…" paragraph, ends line 28) and BEFORE the `{#if banner}` block, add:

```svelte
<div
	class="mt-3 rounded-mlq-control border border-mlq-subtle bg-mlq-surface-alt/40 p-3 text-xs text-mlq-text"
>
	<strong>What this is.</strong> Some tool servers ask you to sign in with your own account. Connect once
	here and the assistant can use them for you in chat — nothing runs without your sign-in.
</div>
```

- [ ] **Step 3: Gate + commit**

```bash
npm run check && npm run lint
git add "src/routes/(app)/settings/mcp/+page.svelte" "src/routes/(app)/settings/connections/+page.svelte"
git commit -m "feat(settings): plain-language explainers on MCP + Connections (Slice E)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: Chat tool-loop plain-language lines

**Files:**

- Modify: `src/lib/components/Message.svelte`
- Modify: `src/lib/components/ToolSourcesPanel.svelte`
- Modify: `src/lib/components/ToolSourcesPanel.svelte.test.ts`

**Context:** `Message.svelte`'s `awaiting_confirmation` branch renders `<p>The assistant wants to run <span>{c.tool}</span> on <span>{c.provider}</span>.</p>` followed by the destructive `{#if c.destructive}` warning. `ToolSourcesPanel.svelte` renders a header `<p>… Sources consulted ({sources.length})</p>` then the `<ul>`.

- [ ] **Step 1: Add the ToolSourcesPanel subtitle assertion to its test**

In `src/lib/components/ToolSourcesPanel.svelte.test.ts`, inside the first test ("renders a header…"), after the `Sources consulted (2)` assertion, add:

```ts
expect(
	screen.getByText(/External sources the assistant looked up for this answer\./i)
).toBeInTheDocument();
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/components/ToolSourcesPanel.svelte.test.ts`
Expected: FAIL — subtitle text not present yet.

- [ ] **Step 3: Add the subtitle to ToolSourcesPanel**

In `src/lib/components/ToolSourcesPanel.svelte`, immediately AFTER the header `<p>… Sources consulted ({sources.length})</p>` and BEFORE the `<ul>`, add:

```svelte
<p class="mb-2 text-mlq-muted">External sources the assistant looked up for this answer.</p>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/components/ToolSourcesPanel.svelte.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Add the Approve/Deny helper line to Message.svelte**

In `src/lib/components/Message.svelte`, in the `awaiting_confirmation` branch, immediately AFTER the closing `</p>` of the "The assistant wants to run … on …" paragraph and BEFORE the `{#if c.destructive}` block, add:

```svelte
<p class="mt-1 text-mlq-muted">Approve to let it run this once, or Deny to skip it.</p>
```

- [ ] **Step 6: Gate + commit**

```bash
npm run check && npm run lint && npx vitest run src/lib/components/ToolSourcesPanel.svelte.test.ts
git add src/lib/components/Message.svelte src/lib/components/ToolSourcesPanel.svelte src/lib/components/ToolSourcesPanel.svelte.test.ts
git commit -m "feat(chat): plain-language Approve/Deny + sources-panel subtitle (Slice E)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: `/about/research` guide page

**Files:**

- Create: `src/routes/(app)/about/research/+page.svelte`

**Context:** About pages are pure prose `+page.svelte` files (the `/about` `+layout.svelte` provides the rail + container; there is no per-page `+page.server.ts`). Mirror the heading/paragraph rhythm of `src/routes/(app)/about/assistant/+page.svelte` (`h1 mb-4 text-xl font-medium`; `h2 mt-6 mb-2 text-sm … uppercase`; `p mb-3 max-w-prose text-sm leading-relaxed`).

- [ ] **Step 1: Create the page**

```svelte
<!-- src/routes/(app)/about/research/+page.svelte -->
<svelte:head><title>Research — About Donna</title></svelte:head>

<h1 class="mb-4 text-xl font-medium text-mlq-text">Research</h1>

<h2 class="mt-6 mb-2 text-sm font-medium tracking-wide text-mlq-muted uppercase">
	Searching case law
</h2>

<p class="mb-3 max-w-prose text-sm leading-relaxed text-mlq-text">
	The <strong>Research</strong> tab in the sidebar opens a dedicated workspace for U.S. case law.
	Donna looks up court opinions through <strong>CourtListener</strong>, a free repository of
	millions of decisions. Search by topic (e.g. <em>“Chevron deference”</em>) or by case name (e.g.
	<em>“Brown v. Board of Education”</em>), and narrow results with the court and sort-order filters.
</p>

<p class="mb-3 max-w-prose text-sm leading-relaxed text-mlq-text">
	Click any result to open the full opinion in the document panel, where you can read the decision
	and use <strong>Find in opinion</strong> to jump to a phrase within it.
</p>

<h2 class="mt-6 mb-2 text-sm font-medium tracking-wide text-mlq-muted uppercase">
	Verifying citations
</h2>

<p class="mb-3 max-w-prose text-sm leading-relaxed text-mlq-text">
	The <strong>Verify citations</strong> tool takes text containing reporter citations (for example a paragraph
	from a brief) and checks each citation against CourtListener, linking the ones it finds to the matching
	case. It is a fast way to confirm that the authorities in a document are real and correctly cited.
</p>

<h2 class="mt-6 mb-2 text-sm font-medium tracking-wide text-mlq-muted uppercase">
	Research from chat
</h2>

<p class="mb-3 max-w-prose text-sm leading-relaxed text-mlq-text">
	You can also simply ask the <strong>Assistant</strong> to research for you — for example,
	<em>“Find a landmark Supreme Court case on free speech and cite it.”</em> When Donna consults case
	law to answer, it shows a <strong>“⚖ sources consulted”</strong> note beneath the reply listing the
	cases it pulled in, each linking out to CourtListener so you can read the original.
</p>

<h2 class="mt-6 mb-2 text-sm font-medium tracking-wide text-mlq-muted uppercase">Availability</h2>

<p class="mb-3 max-w-prose text-sm leading-relaxed text-mlq-text">
	Case-law research is enabled by your administrator with a CourtListener API token, so each
	operator brings their own key. If the Research tab says it isn't enabled, ask your administrator
	to add a token for this deployment.
</p>
```

- [ ] **Step 2: Gate + commit**

```bash
npm run check && npm run lint
git add "src/routes/(app)/about/research/+page.svelte"
git commit -m "docs(about): Research guide page (Slice E)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 6: `/about/tools` guide page

**Files:**

- Create: `src/routes/(app)/about/tools/+page.svelte`

**Context:** Same prose style as Task 5.

- [ ] **Step 1: Create the page**

```svelte
<!-- src/routes/(app)/about/tools/+page.svelte -->
<svelte:head><title>Tools & connections — About Donna</title></svelte:head>

<h1 class="mb-4 text-xl font-medium text-mlq-text">Tools &amp; connections</h1>

<p class="mb-3 max-w-prose text-sm leading-relaxed text-mlq-text">
	Beyond answering from your documents and knowledge bases, Donna's assistant can use <strong
		>tools</strong
	>
	— external services that look things up or take an action — when they help answer your request. Donna
	keeps you in control of when and whether a tool runs.
</p>

<h2 class="mt-6 mb-2 text-sm font-medium tracking-wide text-mlq-muted uppercase">MCP tools</h2>

<p class="mb-3 max-w-prose text-sm leading-relaxed text-mlq-text">
	<strong>MCP</strong> (Model Context Protocol) servers are collections of external tools your
	administrator connects to the deployment — for example a documentation or reference lookup. Under
	<strong>Settings → MCP</strong> you can see which servers are connected and enable the individual tools
	you want the assistant to be able to use.
</p>

<h2 class="mt-6 mb-2 text-sm font-medium tracking-wide text-mlq-muted uppercase">
	Approving a tool in chat
</h2>

<p class="mb-3 max-w-prose text-sm leading-relaxed text-mlq-text">
	When the assistant wants to use a tool, it pauses and asks first: a card appears in the chat
	naming the tool and what it will do, with <strong>Approve</strong> and <strong>Deny</strong> buttons.
	Approve lets it run that one time; Deny skips it and the assistant continues without it. Tools that
	could change something are flagged as destructive. Nothing external happens without your click.
</p>

<h2 class="mt-6 mb-2 text-sm font-medium tracking-wide text-mlq-muted uppercase">Connections</h2>

<p class="mb-3 max-w-prose text-sm leading-relaxed text-mlq-text">
	Some tool servers require you to sign in with your own account. Under
	<strong>Settings → Connections</strong> you connect each one once; afterwards the assistant can
	use it on your behalf. If you start a chat that needs a connection you haven't made yet, the
	assistant shows a <strong>Connect</strong> prompt inline so you can link it on the spot.
</p>

<h2 class="mt-6 mb-2 text-sm font-medium tracking-wide text-mlq-muted uppercase">
	Where answers came from
</h2>

<p class="mb-3 max-w-prose text-sm leading-relaxed text-mlq-text">
	When a tool pulls in outside material — such as case law from CourtListener — Donna shows a
	<strong>“sources consulted”</strong> note beneath the answer listing those external sources with
	links. This is separate from the green / amber / red <strong>verified-quote citations</strong>
	described on the <strong>Trust &amp; citations</strong> page: those check a quote against a source,
	while “sources consulted” simply records which outside materials the assistant looked at.
</p>
```

- [ ] **Step 2: Gate + commit**

```bash
npm run check && npm run lint
git add "src/routes/(app)/about/tools/+page.svelte"
git commit -m "docs(about): Tools & connections guide page (Slice E)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 7: About rail links + Overview mention

**Files:**

- Modify: `src/lib/about/AboutRail.svelte`
- Test: `src/lib/about/AboutRail.svelte.test.ts`
- Modify: `src/routes/(app)/about/overview/+page.svelte`

**Context:** `AboutRail.svelte` holds a `sections` array of `{ href, label }`. Placement (from the spec): **Research** after `Tabular`; **Tools & connections** before `Trust & citations`.

- [ ] **Step 1: Write the failing rail test**

```ts
// src/lib/about/AboutRail.svelte.test.ts
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import AboutRail from './AboutRail.svelte';

describe('AboutRail', () => {
	it('links the Research and Tools & connections guide pages', () => {
		render(AboutRail);
		const research = screen.getByRole('link', { name: 'Research' });
		expect(research).toHaveAttribute('href', '/about/research');
		const tools = screen.getByRole('link', { name: 'Tools & connections' });
		expect(tools).toHaveAttribute('href', '/about/tools');
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/about/AboutRail.svelte.test.ts`
Expected: FAIL — no such links yet.

- [ ] **Step 3: Add the two sections**

In `src/lib/about/AboutRail.svelte`, update the `sections` array to insert the two entries (Research after Tabular; Tools before Trust):

```ts
const sections: { href: string; label: string }[] = [
	{ href: '/about/overview', label: 'Overview' },
	{ href: '/about/assistant', label: 'Assistant' },
	{ href: '/about/projects', label: 'Projects' },
	{ href: '/about/workflows', label: 'Workflows' },
	{ href: '/about/automations', label: 'Automations' },
	{ href: '/about/tabular', label: 'Tabular' },
	{ href: '/about/research', label: 'Research' },
	{ href: '/about/knowledge', label: 'Knowledge' },
	{ href: '/about/models', label: 'Models' },
	{ href: '/about/tools', label: 'Tools & connections' },
	{ href: '/about/trust', label: 'Trust & citations' }
];
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/about/AboutRail.svelte.test.ts`
Expected: PASS (1 test).

- [ ] **Step 5: Mention Research + Tools in the Overview tour**

In `src/routes/(app)/about/overview/+page.svelte`, in the "A tour of the sidebar" `<ul>`, add a `Research` bullet immediately after the `Tabular` bullet:

```svelte
<li>
	<strong>Research</strong> — search U.S. case law from CourtListener: find decisions by topic or name,
	read full opinions, and verify citations.
</li>
```

Then, in the "How this guide is organised" paragraph, replace the final sentence:

```svelte
The <strong>Knowledge</strong>,
<strong>Models</strong>, and <strong>Trust &amp; citations</strong> pages cover the infrastructure behind
Donna's answers.
```

with:

```svelte
The <strong>Research</strong> page covers case-law lookups, <strong>Tools &amp; connections</strong>
covers external tools and the in-chat approval flow, and the <strong>Knowledge</strong>,
<strong>Models</strong>, and <strong>Trust &amp; citations</strong> pages cover the infrastructure behind
Donna's answers.
```

- [ ] **Step 6: Gate + commit**

```bash
npm run check && npm run lint && npx vitest run src/lib/about/AboutRail.svelte.test.ts
git add src/lib/about/AboutRail.svelte src/lib/about/AboutRail.svelte.test.ts "src/routes/(app)/about/overview/+page.svelte"
git commit -m "docs(about): rail links + Overview mention for Research & Tools (Slice E)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 8: Live e2e

**Files:**

- Create: `tests/discoverability.spec.ts`

**Context:** Playwright runs live against the stack (rebuild `donna-web` first — the controller does this). Login helper mirrors `tests/applied-skills.spec.ts`. Research is enabled in the dev stack.

- [ ] **Step 1: Write the e2e**

```ts
// tests/discoverability.spec.ts
import { test, expect } from '@playwright/test';

const EMAIL = process.env.DONNA_E2E_EMAIL!;
const PASSWORD = process.env.DONNA_E2E_PASSWORD!;

async function login(page: any) {
	await page.goto('/login');
	await page.fill('input[name="email"]', EMAIL);
	await page.fill('input[name="password"]', PASSWORD);
	await page.click('button:has-text("Sign in")');
	await page.waitForURL('/');
}

test('about guide has Research and Tools & connections pages', async ({ page }) => {
	await login(page);
	await page.goto('/about/research');
	await expect(page.getByRole('heading', { level: 1, name: 'Research' })).toBeVisible();
	await expect(page.getByText(/CourtListener/i).first()).toBeVisible();
	await page.goto('/about/tools');
	await expect(page.getByRole('heading', { level: 1, name: /Tools & connections/i })).toBeVisible();
	await expect(page.getByText(/Approve/i).first()).toBeVisible();
	// the rail links both
	await expect(page.getByRole('link', { name: 'Research' })).toBeVisible();
	await expect(page.getByRole('link', { name: 'Tools & connections' })).toBeVisible();
});

test('research starters run a real search', async ({ page }) => {
	await login(page);
	await page.goto('/research');
	const chip = page.getByRole('button', { name: 'Chevron deference' });
	await expect(chip).toBeVisible({ timeout: 10000 });
	await chip.click();
	// the query box is filled and results populate
	await expect(page.getByRole('searchbox', { name: /search case law/i })).toHaveValue(
		'Chevron deference'
	);
	// pre-search the heading is just "Results"; after a search it gains a "(N)" count
	await expect(page.getByText(/Results\s*\(\d/i)).toBeVisible({ timeout: 30000 });
});

test('landing composer offers an example case-law prompt', async ({ page }) => {
	await login(page);
	const starter = page.getByRole('button', {
		name: /landmark U\.S\. Supreme Court case on free speech/i
	});
	await expect(starter).toBeVisible();
	await starter.click();
	await expect(page.locator('textarea')).toHaveValue(
		/landmark U\.S\. Supreme Court case on free speech/i
	);
});
```

- [ ] **Step 2: Rebuild + run (controller runs this)**

```bash
docker compose build donna-web && docker compose up -d --no-deps donna-web
npx playwright test tests/discoverability.spec.ts
```

Expected: 3 passing.

- [ ] **Step 3: Commit**

```bash
git add tests/discoverability.spec.ts
git commit -m "test(e2e): discoverability — about pages, research starters, composer starter (Slice E)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Final verification (before whole-branch review + PR)

- [ ] `npm run check` → 0 errors / 0 warnings.
- [ ] `npm run lint` → fully clean.
- [ ] `npx vitest run` → full suite green (1446 + new tests).
- [ ] Rebuild `donna-web` in isolation (`docker compose build donna-web && docker compose up -d --no-deps donna-web`), then `npx playwright test tests/discoverability.spec.ts` → 3 passing.
- [ ] Whole-branch review (superpowers:requesting-code-review), fold fixes.
- [ ] PR with a **merge commit** (never squash). Then mirror `main` + branch to `tucuxi`.

## Spec → task coverage map

- A1 Research intro + starters → Task 1. A2/A3 MCP + Connections explainers → Task 3. A4 chat lines → Task 4. A5 composer starter → Task 2.
- B1 `/about/research` → Task 5. B2 `/about/tools` → Task 6. B3 rail + Overview → Task 7.
- Testing (component/render/e2e) → folded into Tasks 1, 2, 4, 7 + Task 8.
