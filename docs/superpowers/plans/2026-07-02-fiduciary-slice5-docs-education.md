# Fiduciary Slice 5 — Documentation & Education Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Teach the non-technical legal user the shipped fiduciary-auditability features with a high-level `/about/fiduciary` guide page, one Donna-specific interactive playground (`trust-states.html`), and a repo/user docs refresh — pointing at LQ-AI's engine visualizations rather than rebuilding them.

**Architecture:** A new bare prose page (`about/fiduciary/+page.svelte`, mirroring `about/trust`) explains the features and embeds one new self-contained playground (`static/learn/playgrounds/trust-states.html`) that reproduces `trust.ts`'s four trust states + the zero-assertion honesty rule. "How a quote is verified" drills into the already-vendored `citation-engine-cascade` playground; LQ-AI's five unbuilt fiduciary playgrounds are mentioned but **not** hard-linked. A docs refresh updates README/PRODUCT/GUIDE/CHANGELOG.

**Tech Stack:** SvelteKit (Svelte 5), Tailwind, vanilla-JS single-file playground, Vitest + @testing-library/svelte, Playwright (live e2e).

## Global Constraints

- **Never edit `vendor/lq-ai`** (pinned submodule). No pin bump, no backend change, no new API in this slice.
- **Audience = non-technical legal user; plain language, high-level, with progressive drill-down.** Mirror LQ-AI's honest, don't-overclaim posture.
- **Point, don't rebuild:** drill "how a quote is verified" into the local `citation-engine-cascade` playground. Build **only** `trust-states.html`.
- **Do NOT hard-link LQ-AI's unbuilt fiduciary playground slugs** (`citation-ledger`, `fiduciary-gate`, `matter-session-flow`, `authority-sources`, `treatment-layer`) — they will 404. Mention them in prose as "coming from the LQ-AI engine" only.
- **Honest caveats carried verbatim:** treatment is "derived, not editorial" (never color a case good/bad law); the ledger references content by id/offset, not raw payloads; the provenance export is an honest copy, **not** a signed attestation; "No sourced claims" is neutral, never green (nothing to verify ≠ verified); authority sources are behind operator config; EUR-Lex is get-by-CELEX only (no keyword search yet).
- **Four trust states** (faithful to `src/lib/fiduciary/trust.ts`, switch on `gate_status`, honesty rule checked first): `fiduciary_grade` + `total_assertions === 0` → **No sourced claims** (grey); `fiduciary_grade` + >0 → **Fiduciary-grade** (green); `supported_only` → **Supported** (amber); `flagged`/else → **Needs review** (red).
- **Prose page = bare `.svelte`** (mirror `about/overview`/`about/trust`): h1 `mb-4 text-xl font-medium text-mlq-text`; h2 `mt-6 mb-2 text-sm font-medium tracking-wide text-mlq-muted uppercase`; p `mb-3 max-w-prose text-sm leading-relaxed text-mlq-text`; ul `mb-3 ml-4 list-disc space-y-1 text-sm text-mlq-text`. Default `max-w-5xl` (no layout change). Tabs for indentation.
- **Gates every task:** `npm run check` 0/0 (ignore the harmless vendor `ERR_MODULE_NOT_FOUND`); `npm run lint` fully green; `npx vitest run` passing. Commit per task; PR with a **merge commit** (never squash); mirror `main` to `tucuxi`.
- The **About PDF regen** is release-tail (per spec §7), **not** a task here.

## File Structure

- `static/learn/playgrounds/trust-states.html` (new) — the self-contained trust-state explorer.
- `src/routes/(app)/about/fiduciary/+page.svelte` (new) — the guide page (embeds the playground, drills into `citation-engine-cascade`).
- `src/lib/about/AboutRail.svelte` (modify) — add the rail entry.
- `README.md`, `docs/PRODUCT.md`, `docs/GUIDE.md`, `CHANGELOG.md` (modify) — docs refresh.
- Tests: `about/fiduciary/page.svelte.test.ts` (new), `AboutRail.svelte.test.ts` (extend), `tests/fiduciary-about.spec.ts` (new e2e).

---

### Task 1: The `trust-states.html` playground

**Files:**

- Create: `static/learn/playgrounds/trust-states.html`
- Test: `src/lib/about/trustStatesPlayground.test.ts`

**Interfaces:**

- Produces: a static asset served at `/learn/playgrounds/trust-states.html`. Contains radio controls with the visible labels `Every quoted claim matched its source`, `Backed in substance`, `A quote couldn't be confirmed`, a checkbox labelled `This answer made sourced claims`, and a pill whose label text is one of `Fiduciary-grade` / `Supported` / `Needs review` / `No sourced claims` (element `#pill-label`). These labels are the stable hooks the Task 4 e2e drives.

- [ ] **Step 1: Write the failing guard test**

Create `src/lib/about/trustStatesPlayground.test.ts`:

```ts
// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const html = (() => {
	try {
		return readFileSync('static/learn/playgrounds/trust-states.html', 'utf-8');
	} catch {
		return '';
	}
})();

describe('trust-states.html playground', () => {
	it('exists and is a self-contained single file (no external script/stylesheet)', () => {
		expect(html).not.toBe('');
		expect(html).not.toMatch(/<script[^>]+\bsrc=/i);
		expect(html).not.toMatch(/<link[^>]+stylesheet/i);
	});
	it('names all four trust states', () => {
		for (const label of ['Fiduciary-grade', 'Supported', 'Needs review', 'No sourced claims'])
			expect(html).toContain(label);
	});
	it('carries the zero-assertion honesty rule and a Learn back-link', () => {
		expect(html.toLowerCase()).toContain('nothing to verify');
		expect(html).toContain('↩');
	});
	it('exposes the control labels the guide + e2e depend on', () => {
		expect(html).toContain('Backed in substance');
		expect(html).toContain('This answer made sourced claims');
		expect(html).toContain('id="pill-label"');
	});
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/lib/about/trustStatesPlayground.test.ts`
Expected: FAIL — the file does not exist (`html === ''`).

- [ ] **Step 3: Create the playground**

Create `static/learn/playgrounds/trust-states.html` exactly:

```html
<!doctype html>
<html lang="en">
	<head>
		<meta charset="utf-8" />
		<meta name="viewport" content="width=device-width, initial-scale=1" />
		<title>Trust states — how Donna labels an answer's trustworthiness</title>
		<style>
			:root {
				--bg: #0c0f14;
				--bg-elev: #151a23;
				--bg-elev-2: #1d242f;
				--border: #2a3340;
				--text: #e6ebf3;
				--text-dim: #8a96a8;
				--text-faint: #5a6578;
				--grade: #16a34a;
				--supported: #c9a227;
				--review: #dc2626;
				--none: #9ca3af;
			}
			* {
				box-sizing: border-box;
			}
			html,
			body {
				margin: 0;
				height: 100%;
			}
			body {
				background: var(--bg);
				color: var(--text);
				font:
					14px/1.55 -apple-system,
					BlinkMacSystemFont,
					'Segoe UI',
					system-ui,
					sans-serif;
			}
			.app {
				display: grid;
				grid-template-rows: auto 1fr;
				min-height: 100vh;
			}
			header {
				display: flex;
				align-items: center;
				justify-content: space-between;
				gap: 12px;
				padding: 14px 20px;
				border-bottom: 1px solid var(--border);
			}
			header h1 {
				margin: 0;
				font-size: 15px;
				font-weight: 600;
			}
			header p {
				margin: 2px 0 0;
				font-size: 12px;
				color: var(--text-dim);
			}
			.back {
				color: var(--text-dim);
				text-decoration: none;
				font-size: 13px;
				white-space: nowrap;
			}
			.back:hover {
				color: var(--text);
			}
			main {
				display: grid;
				grid-template-columns: minmax(240px, 320px) 1fr;
				gap: 20px;
				padding: 20px;
			}
			@media (max-width: 720px) {
				main {
					grid-template-columns: 1fr;
				}
			}
			.controls,
			.preview {
				background: var(--bg-elev);
				border: 1px solid var(--border);
				border-radius: 10px;
				padding: 16px;
			}
			.controls h2,
			.preview h2 {
				margin: 0 0 10px;
				font-size: 11px;
				letter-spacing: 0.06em;
				text-transform: uppercase;
				color: var(--text-dim);
			}
			.opt {
				display: flex;
				gap: 8px;
				align-items: flex-start;
				padding: 8px 10px;
				border: 1px solid var(--border);
				border-radius: 8px;
				margin-bottom: 8px;
				cursor: pointer;
			}
			.opt:hover {
				border-color: var(--text-faint);
			}
			.opt input {
				margin-top: 2px;
			}
			.opt span {
				font-size: 13px;
			}
			.opt small {
				display: block;
				color: var(--text-dim);
				font-size: 11px;
			}
			.divider {
				height: 1px;
				background: var(--border);
				margin: 14px 0;
			}
			.pill {
				display: inline-flex;
				align-items: center;
				gap: 6px;
				border: 1px solid;
				border-radius: 999px;
				padding: 3px 12px;
				font-size: 13px;
				font-weight: 600;
			}
			.pill .dot {
				width: 8px;
				height: 8px;
				border-radius: 50%;
			}
			.pill.grade {
				color: var(--grade);
				border-color: rgba(22, 163, 74, 0.5);
				background: rgba(22, 163, 74, 0.12);
			}
			.pill.grade .dot {
				background: var(--grade);
			}
			.pill.supported {
				color: var(--supported);
				border-color: rgba(201, 162, 39, 0.5);
				background: rgba(201, 162, 39, 0.12);
			}
			.pill.supported .dot {
				background: var(--supported);
			}
			.pill.review {
				color: var(--review);
				border-color: rgba(220, 38, 38, 0.5);
				background: rgba(220, 38, 38, 0.12);
			}
			.pill.review .dot {
				background: var(--review);
			}
			.pill.none {
				color: var(--none);
				border-color: rgba(156, 163, 175, 0.5);
				background: rgba(156, 163, 175, 0.12);
			}
			.pill.none .dot {
				background: var(--none);
			}
			#explanation {
				margin: 14px 0 0;
				font-size: 14px;
			}
			#why {
				margin: 8px 0 0;
				font-size: 12px;
				color: var(--text-dim);
			}
			.rule {
				margin-top: 18px;
				padding: 12px 14px;
				border-left: 3px solid var(--none);
				background: var(--bg-elev-2);
				border-radius: 0 8px 8px 0;
				font-size: 12px;
				color: var(--text-dim);
			}
			.rule strong {
				color: var(--text);
			}
		</style>
	</head>
	<body>
		<div class="app">
			<header>
				<div>
					<h1>Trust states</h1>
					<p>How Donna labels an answer's trustworthiness — the pill you see on every reply.</p>
				</div>
				<a class="back" href="../../">↩ Learn</a>
			</header>
			<main>
				<section class="controls">
					<h2>What happened when Donna verified the answer</h2>
					<label class="opt"
						><input type="radio" name="gate" value="fiduciary_grade" checked /><span
							>Every quoted claim matched its source<small
								>The strongest result: each quote was found in the real source.</small
							></span
						></label
					>
					<label class="opt"
						><input type="radio" name="gate" value="supported_only" /><span
							>Backed in substance<small
								>Verified by meaning rather than an exact quote match.</small
							></span
						></label
					>
					<label class="opt"
						><input type="radio" name="gate" value="flagged" /><span
							>A quote couldn't be confirmed<small
								>At least one quote wasn't found in its source — worth a look.</small
							></span
						></label
					>
					<div class="divider"></div>
					<label class="opt"
						><input type="checkbox" id="assertions" checked /><span
							>This answer made sourced claims<small
								>Uncheck to see what happens when there is nothing to verify.</small
							></span
						></label
					>
				</section>
				<section class="preview">
					<h2>The trust pill you'd see</h2>
					<span id="pill" class="pill grade"
						><span class="dot"></span><span id="pill-label">Fiduciary-grade</span></span
					>
					<p id="explanation"></p>
					<p id="why"></p>
					<div class="rule">
						<strong>The honesty rule:</strong> an answer that made no sourced claims is never marked
						green. With nothing to verify, "verified" would be misleading — so it shows the neutral
						<em>No sourced claims</em> instead. Green is earned, not defaulted.
					</div>
				</section>
			</main>
		</div>
		<script>
			// Mirrors src/lib/fiduciary/trust.ts:gateVerdict — the honesty rule is checked first.
			var STATES = {
				grade: {
					cls: 'grade',
					label: 'Fiduciary-grade',
					explanation: 'Every quoted claim was matched against its original source.',
					why: 'The answer made sourced claims and all of them checked out.'
				},
				supported: {
					cls: 'supported',
					label: 'Supported',
					explanation: 'Claims are backed by the sources in substance, verified by meaning.',
					why: 'Support was confirmed by meaning rather than an exact quote match.'
				},
				review: {
					cls: 'review',
					label: 'Needs review',
					explanation: 'At least one quoted claim could not be confirmed in its source.',
					why: 'Read the flagged quote against its source before relying on it.'
				},
				none: {
					cls: 'none',
					label: 'No sourced claims',
					explanation: 'This answer did not quote or rely on a specific source.',
					why: 'Nothing to verify — neutral, never green.'
				}
			};
			function verdict(status, hasAssertions) {
				if (status === 'fiduciary_grade' && !hasAssertions) return STATES.none;
				if (status === 'fiduciary_grade') return STATES.grade;
				if (status === 'supported_only') return STATES.supported;
				return STATES.review;
			}
			function render() {
				var status = document.querySelector('input[name="gate"]:checked').value;
				var hasAssertions = document.getElementById('assertions').checked;
				var v = verdict(status, hasAssertions);
				var pill = document.getElementById('pill');
				pill.className = 'pill ' + v.cls;
				document.getElementById('pill-label').textContent = v.label;
				document.getElementById('explanation').textContent = v.explanation;
				document.getElementById('why').textContent = v.why;
			}
			document.querySelectorAll('input[name="gate"], #assertions').forEach(function (el) {
				el.addEventListener('change', render);
			});
			render();
		</script>
	</body>
</html>
```

- [ ] **Step 4: Run the guard test to verify it passes**

Run: `npx vitest run src/lib/about/trustStatesPlayground.test.ts`
Expected: PASS (all four cases).

- [ ] **Step 5: Run the gates**

Run: `npm run check && npm run lint && npx vitest run`
Expected: check 0/0, lint green, full suite passing. (Prettier formats HTML — if it reflows the file, that's fine; re-run the guard test after to confirm it still passes.)

- [ ] **Step 6: Commit**

```bash
git add static/learn/playgrounds/trust-states.html src/lib/about/trustStatesPlayground.test.ts
git commit -m "feat(fiduciary): trust-states learn playground"
```

---

### Task 2: The `/about/fiduciary` guide page + rail entry

**Files:**

- Create: `src/routes/(app)/about/fiduciary/+page.svelte`
- Create: `src/routes/(app)/about/fiduciary/page.svelte.test.ts`
- Modify: `src/lib/about/AboutRail.svelte:4-16`
- Test: `src/lib/about/AboutRail.svelte.test.ts`

**Interfaces:**

- Consumes: the playground at `/learn/playgrounds/trust-states.html` (Task 1) and the vendored `/learn/playgrounds/citation-engine-cascade.html` (already present).
- Produces: the route `/about/fiduciary` and a rail link labelled `Fiduciary receipts`.

- [ ] **Step 1: Write the failing tests**

Create `src/routes/(app)/about/fiduciary/page.svelte.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import Page from './+page.svelte';

describe('/about/fiduciary page', () => {
	it('names the four trust states', () => {
		render(Page);
		// Labels sit in <strong> inside <li>/<p>, so both the inner and outer element
		// match an un-anchored regex — assert at least one match rather than exactly one.
		for (const label of ['Fiduciary-grade', 'Supported', 'Needs review', 'No sourced claims'])
			expect(screen.getAllByText(new RegExp(label)).length).toBeGreaterThan(0);
	});
	it('embeds the trust-states playground', () => {
		const { container } = render(Page);
		const iframe = container.querySelector('iframe');
		expect(iframe).toHaveAttribute('src', '/learn/playgrounds/trust-states.html');
	});
	it('drills into the citation-engine-cascade playground for the verification mechanism', () => {
		render(Page);
		const link = screen.getByRole('link', { name: /how a quote is verified/i });
		expect(link).toHaveAttribute('href', '/learn/playgrounds/citation-engine-cascade.html');
	});
	it('carries the honest caveats (derived-not-editorial, not a signed attestation)', () => {
		render(Page);
		expect(screen.getAllByText(/derived, not editorial/i).length).toBeGreaterThan(0);
		expect(
			screen.getAllByText(/not a (cryptographically )?signed attestation/i).length
		).toBeGreaterThan(0);
	});
});
```

Add to `src/lib/about/AboutRail.svelte.test.ts` inside the `describe('AboutRail', …)` block:

```ts
it('links the Fiduciary receipts guide page', () => {
	render(AboutRail);
	const fiduciary = screen.getByRole('link', { name: 'Fiduciary receipts' });
	expect(fiduciary).toHaveAttribute('href', '/about/fiduciary');
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run "src/routes/(app)/about/fiduciary" src/lib/about/AboutRail.svelte.test.ts`
Expected: FAIL — the page module doesn't exist; the rail link is absent.

- [ ] **Step 3: Add the rail entry**

In `src/lib/about/AboutRail.svelte`, add to the `sections` array immediately after the `trust` entry (line 15):

```ts
		{ href: '/about/trust', label: 'Trust & citations' },
		{ href: '/about/fiduciary', label: 'Fiduciary receipts' }
```

- [ ] **Step 4: Create the guide page**

Create `src/routes/(app)/about/fiduciary/+page.svelte` exactly:

```svelte
<svelte:head><title>Fiduciary receipts — About Donna</title></svelte:head>

<h1 class="mb-4 text-xl font-medium text-mlq-text">Fiduciary receipts</h1>

<p class="mb-3 max-w-prose text-sm leading-relaxed text-mlq-text">
	Donna keeps an <strong>honest provenance record on every answer</strong>: for each reply, what
	sources it used, exactly what it quoted from each, whether that quote was actually found in the
	real source, and — for cases — whether it is still good law. You never have to take the answer on
	faith; you can trace any claim back to where it came from.
</p>

<h2 class="mt-6 mb-2 text-sm font-medium tracking-wide text-mlq-muted uppercase">
	The four trust states
</h2>

<p class="mb-3 max-w-prose text-sm leading-relaxed text-mlq-text">
	Every assistant answer carries a small <strong>trust pill</strong> that tells you, at a glance, how
	well its quoted claims held up when Donna checked them against their sources:
</p>

<ul class="mb-3 ml-4 list-disc space-y-1 text-sm text-mlq-text">
	<li>
		<strong>Fiduciary-grade (green).</strong> The answer made sourced claims and every quoted claim was
		matched against its original source.
	</li>
	<li>
		<strong>Supported (amber).</strong> The claims are backed by the sources in substance — verified by
		meaning rather than an exact quote match.
	</li>
	<li>
		<strong>Needs review (red).</strong> At least one quoted claim could not be confirmed in its source.
		Read the flagged quote against the original before relying on it.
	</li>
	<li>
		<strong>No sourced claims (neutral grey).</strong> This answer did not quote or rely on a
		specific source. It is deliberately <em>never</em> shown as green: with nothing to verify, "verified"
		would be misleading — nothing to verify is not the same as verified.
	</li>
</ul>

<p class="mb-3 max-w-prose text-sm leading-relaxed text-mlq-text">
	Try each state below — pick what happened when Donna verified an answer, and see the exact pill
	you would get. Toggling "made sourced claims" off shows the honesty rule in action.
</p>

<iframe
	src="/learn/playgrounds/trust-states.html"
	title="Trust states — interactive"
	loading="lazy"
	class="mt-2 h-[520px] w-full rounded-mlq-control border border-mlq-subtle"
></iframe>
<div class="mt-2 text-xs text-mlq-muted">
	<a
		href="/learn/playgrounds/trust-states.html"
		target="_blank"
		rel="noopener noreferrer"
		class="text-mlq-strong hover:underline">Open full-screen ↗</a
	>
</div>

<h2 class="mt-6 mb-2 text-sm font-medium tracking-wide text-mlq-muted uppercase">
	The receipt & citation ledger
</h2>

<p class="mb-3 max-w-prose text-sm leading-relaxed text-mlq-text">
	Click the trust pill to open the <strong>fiduciary receipt</strong> — the citation ledger for that
	answer. It lists each source the assistant actually read, the exact passage it quoted, and a
	verification chip for that quote, so you can <strong>trace any claim to its source</strong> in one
	click. Knowledge-base sources open in the document panel; cases open the opinion; statutes and
	regulations link out to the authority. The ledger records
	<em>what was read and whether the quote matched</em>, referenced by identifier and passage
	location — not by stashing copies of the source text.
</p>

<h2 class="mt-6 mb-2 text-sm font-medium tracking-wide text-mlq-muted uppercase">
	Case treatment (validity)
</h2>

<p class="mb-3 max-w-prose text-sm leading-relaxed text-mlq-text">
	Where an answer relies on case law, the receipt can show <strong>derived treatment signals</strong
	>
	— how often the case has been cited and whether later courts followed, distinguished, or criticised
	it — each with a trace to the citing case. This is <strong>derived, not editorial</strong>: it is
	a signal to guide your own reading, <em>not</em> an authoritative citator, and Donna never colours a
	case "good" or "bad" law for you.
</p>

<h2 class="mt-6 mb-2 text-sm font-medium tracking-wide text-mlq-muted uppercase">
	Matter sessions — the audit timeline
</h2>

<p class="mb-3 max-w-prose text-sm leading-relaxed text-mlq-text">
	When Donna runs an autonomous matter session, its receipt is the same fiduciary record at the
	matter level — a timeline of who did what, on whose behalf, at what cost, alongside a session-wide
	trust pill answering the one question a reviewer cares about: <strong
		>is this work product fiduciary-grade?</strong
	>
</p>

<h2 class="mt-6 mb-2 text-sm font-medium tracking-wide text-mlq-muted uppercase">
	Authoritative sources
</h2>

<p class="mb-3 max-w-prose text-sm leading-relaxed text-mlq-text">
	The Research page lists the primary-law sources this instance can reach — U.S. case law
	(CourtListener), the U.S. Code and CFR (GovInfo), public filings (SEC EDGAR), and EU legislation
	and CJEU case law (EUR-Lex). Each is retrieved <em>and</em> character-verified through the same governed
	path. Availability depends on how your operator has configured the instance, and EU law is currently
	fetch-by-identifier (CELEX) only; a source that isn't configured shows as unavailable rather than silently
	disappearing.
</p>

<h2 class="mt-6 mb-2 text-sm font-medium tracking-wide text-mlq-muted uppercase">
	Take it with you — provenance export
</h2>

<p class="mb-3 max-w-prose text-sm leading-relaxed text-mlq-text">
	From any chat turn or matter session you can <strong>export the provenance record</strong> — a
	structured JSON file and a printable Markdown copy of the whole sourcing trail. It is labelled
	honestly for what it is: a faithful copy of the record,
	<strong>not a cryptographically signed attestation</strong>. It is designed so that, when a signed
	export becomes available, the same button can produce it.
</p>

<h2 class="mt-6 mb-2 text-sm font-medium tracking-wide text-mlq-muted uppercase">Under the hood</h2>

<p class="mb-3 max-w-prose text-sm leading-relaxed text-mlq-text">
	Want to see how a quote actually gets verified? The LQ-AI engine runs a four-stage
	character-fidelity cascade on every quoted passage.
	<a
		href="/learn/playgrounds/citation-engine-cascade.html"
		target="_blank"
		rel="noopener noreferrer"
		class="text-mlq-strong hover:underline">Drill into how a quote is verified ↗</a
	>
</p>

<p class="mb-3 max-w-prose text-sm leading-relaxed text-mlq-text">
	Deeper interactive explorers of the citation ledger, the fiduciary gate, the authority sources,
	and the treatment layer are on the way from the LQ-AI engine; this page will link to them as they
	ship.
</p>
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run "src/routes/(app)/about/fiduciary" src/lib/about/AboutRail.svelte.test.ts`
Expected: PASS.

- [ ] **Step 6: Run the gates**

Run: `npm run check && npm run lint && npx vitest run`
Expected: check 0/0, lint green, full suite passing.

- [ ] **Step 7: Commit**

```bash
git add "src/routes/(app)/about/fiduciary/+page.svelte" "src/routes/(app)/about/fiduciary/page.svelte.test.ts" src/lib/about/AboutRail.svelte src/lib/about/AboutRail.svelte.test.ts
git commit -m "feat(fiduciary): /about/fiduciary guide page + rail entry"
```

---

### Task 3: Docs refresh (README, PRODUCT, GUIDE, CHANGELOG)

**Files:**

- Modify: `README.md`, `docs/PRODUCT.md`, `docs/GUIDE.md`, `CHANGELOG.md`

**Interfaces:**

- Consumes: nothing (prose). Produces: no code — a documentation deliverable, verified by inspection + the link check in Step 6.

- [ ] **Step 1: README — add a fiduciary bullet to "What's inside"**

In `README.md`, under the "What's inside" bullet list (near the citation/receipts bullets), add:

```markdown
- **Fiduciary receipts** — every answer carries a trust pill and an expandable citation ledger (sources, quoted passages, verification, case treatment); autonomous sessions get the same matter-level audit trail, and any receipt can be exported as an honest provenance record. See the in-app **About → Fiduciary receipts** guide.
```

- [ ] **Step 2: PRODUCT.md — extend "Trust & control"**

In `docs/PRODUCT.md`, at the end of the "Trust & control" section, add a subsection:

```markdown
### Fiduciary receipts

Beyond inline citation pills, every assistant answer carries a **trust pill** in one of four honest states — **Fiduciary-grade**, **Supported**, **Needs review**, or **No sourced claims** (neutral, never green: nothing to verify is not the same as verified). Expanding it opens the **citation ledger**: each source read, the exact passage quoted, its verification status, and — for case law — derived treatment signals (cited-by, followed/distinguished/criticised) with a trace to each citing case. Treatment is **derived, not editorial** — a signal, not an authoritative citator. Autonomous matter sessions carry the same ledger at the matter level, alongside cost, as an audit timeline. Any receipt can be **exported** as a structured JSON + printable Markdown provenance record — a faithful copy, honestly labelled as **not a cryptographically signed attestation**. The ledger references content by identifier and passage location, not by storing raw payloads.
```

- [ ] **Step 3: GUIDE.md — extend "Trust & citations — the heart of it"**

In `docs/GUIDE.md`, at the end of the "Trust & citations — the heart of it" section, add:

```markdown
#### Fiduciary receipts — the whole sourcing trail

The citation pills tell you about individual passages; the **trust pill** on each answer tells you about the answer as a whole. It shows one of four states — **Fiduciary-grade** (green: every quoted claim matched its source), **Supported** (amber: backed in substance), **Needs review** (red: a quote couldn't be confirmed), or **No sourced claims** (grey: nothing to verify — deliberately never green). Click it to open the **fiduciary receipt**: the citation ledger of every source the assistant read, what it quoted, and whether each quote checked out, so you can trace any claim back to its source. For case law you'll also see **derived** treatment signals (never an editorial "good/bad law" verdict). Autonomous matter sessions get the same receipt at the matter level, next to cost. And you can **export** any receipt as a JSON + printable Markdown provenance record — a faithful copy, not a signed attestation. The in-app **About → Fiduciary receipts** page walks through all of this with a live trust-state explorer.
```

- [ ] **Step 4: CHANGELOG — add an entry**

In `CHANGELOG.md`, add a new section directly under the top `# Changelog` header / above the latest existing version, matching the Keep-a-Changelog heading style already used:

```markdown
## [Unreleased] — Fiduciary auditability

### Added

- **Fiduciary receipts** across chat and autonomous sessions: a per-answer trust pill (four honest states, incl. the zero-assertion neutral state) opening a citation ledger of sources, quoted passages, and verification status, with click-through to each source.
- **Case treatment** signals on caselaw citations (cited-by, followed/distinguished/criticised) — derived, not editorial.
- **Autonomous matter audit timeline** — the session ledger + a session-level trust pill on the receipt, alongside cost.
- **Provenance export** — download any chat turn or session receipt as a structured JSON envelope + printable Markdown, honestly labelled as not a signed attestation.
- **Authoritative sources** card on Research, and a new **About → Fiduciary receipts** guide with an interactive trust-states explorer.
```

(If the repo already has an `## [Unreleased]` section, merge these bullets into its `### Added` rather than adding a second one.)

- [ ] **Step 5: Verify the docs render and links resolve**

Run: `git diff --stat` and confirm the four files changed. Then check the internal reference resolves:

Run: `grep -rn "about/fiduciary\|About → Fiduciary" README.md docs/PRODUCT.md docs/GUIDE.md`
Expected: the About-page reference appears; no link points at an LQ-AI fiduciary playground slug (`citation-ledger`, `fiduciary-gate`, `matter-session-flow`, `authority-sources`, `treatment-layer`).

- [ ] **Step 6: Run the gates**

Run: `npm run check && npm run lint && npx vitest run`
Expected: check 0/0, lint green (prettier formats Markdown — accept its reflow), full suite passing.

- [ ] **Step 7: Commit**

```bash
git add README.md docs/PRODUCT.md docs/GUIDE.md CHANGELOG.md
git commit -m "docs(fiduciary): document the fiduciary-receipts segment (README/PRODUCT/GUIDE/CHANGELOG)"
```

---

### Task 4: Live e2e — the guide page + the playground

**Files:**

- Create: `tests/fiduciary-about.spec.ts`

**Interfaces:**

- Consumes: the `/about/fiduciary` page (Task 2) embedding the `trust-states.html` playground (Task 1), served by the running stack.

**Preconditions (evidence step):**

- Rebuild the app container so it serves this branch (page + static playground): `docker compose up -d --build donna-web`.
- Stack up; admin fixture `admin@lq.ai`; `.env` provides `DONNA_BASE_URL`, `DONNA_E2E_EMAIL`, `DONNA_E2E_PASSWORD`. Source it before running: `set -a; . ./.env; set +a`.

- [ ] **Step 1: Write the e2e**

Create `tests/fiduciary-about.spec.ts`:

```ts
import { test, expect, type Page } from '@playwright/test';

const EMAIL = process.env.DONNA_E2E_EMAIL ?? 'admin@lq.ai';
const PASSWORD = process.env.DONNA_E2E_PASSWORD!;

async function login(page: Page) {
	await page.goto('/login');
	await page.fill('input[name="email"]', EMAIL);
	await page.fill('input[name="password"]', PASSWORD);
	await page.click('button:has-text("Sign in")');
	await page.waitForURL('/');
}

test('the fiduciary guide page explains the four states and its playground is interactive', async ({
	page
}) => {
	await login(page);

	// Rail link → page.
	await page.goto('/about/overview');
	await page.getByRole('link', { name: 'Fiduciary receipts' }).click();
	await page.waitForURL('**/about/fiduciary');
	await expect(page.getByRole('heading', { name: 'Fiduciary receipts', level: 1 })).toBeVisible();

	// The four state labels are present in the prose.
	for (const label of ['Fiduciary-grade', 'Supported', 'Needs review', 'No sourced claims'])
		await expect(page.getByText(new RegExp(label)).first()).toBeVisible();

	// The embedded playground is interactive: drive its controls, watch the pill change.
	const frame = page.frameLocator('iframe[src="/learn/playgrounds/trust-states.html"]');
	await expect(frame.locator('#pill-label')).toHaveText('Fiduciary-grade'); // default
	await frame.getByText('Backed in substance').click();
	await expect(frame.locator('#pill-label')).toHaveText('Supported');
	// Honesty rule: fiduciary_grade + no sourced claims → No sourced claims (never green).
	await frame.getByText('Every quoted claim matched its source').click();
	await frame.getByText('This answer made sourced claims').click(); // uncheck
	await expect(frame.locator('#pill-label')).toHaveText('No sourced claims');
});
```

- [ ] **Step 2: Rebuild the app container**

Run: `docker compose up -d --build donna-web`
Expected: `donna-web` rebuilt and healthy.

- [ ] **Step 3: Run the e2e**

Run: `set -a; . ./.env; set +a; npx playwright test tests/fiduciary-about.spec.ts`
Expected: PASS. (Clicking a wrapping `<label>` toggles its input; if a click doesn't register on the label text, target the input via `frame.getByRole('radio', { name: /Backed in substance/ })` / `frame.getByRole('checkbox')` instead.)

- [ ] **Step 4: Run the full unit gates**

Run: `npm run check && npm run lint && npx vitest run`
Expected: check 0/0, lint green, full unit suite passing.

- [ ] **Step 5: Commit**

```bash
git add tests/fiduciary-about.spec.ts
git commit -m "test(fiduciary): live e2e for the /about/fiduciary guide + trust-states playground"
```

---

### Task 5: Whole-branch review, PR, merge, mirror

- [ ] **Step 1: Opus whole-branch review**

Dispatch an Opus review of the full branch diff against `main` per `superpowers:requesting-code-review`, focused on: honesty/no-overclaim (the caveats are all present and nothing implies signing/tamper-evidence or hard-links an unbuilt LQ-AI slug), the playground faithfully reproducing `trust.ts`'s four states + honesty rule, the prose being high-level/non-developer, and the page/rail/playground wiring. Address any Critical/Important findings with follow-up commits.

- [ ] **Step 2: Open the PR with a merge commit**

```bash
git push -u origin feat/fiduciary-slice5-docs-education
gh pr create --base main --title "feat(fiduciary): Slice 5 — docs & education" --body "<summary + test evidence>"
```

- [ ] **Step 3: Merge with a merge commit (never squash), then mirror `main` to tucuxi**

```bash
gh pr merge --merge
git checkout main && git pull
git push tucuxi main
```

---

## Self-Review

**Spec coverage (design §4/§5):**

- `/about/fiduciary` high-level guide page (all shipped features + caveats + drill-down) → Task 2. ✅
- AboutRail entry after `trust` → Task 2. ✅
- One new playground `trust-states.html` (four states + honesty rule, standalone dark palette, ↩ Learn) → Task 1. ✅
- Point at `citation-engine-cascade`; mention-not-link LQ-AI's unbuilt slugs → Task 2 (page prose + link) + Global Constraints. ✅
- Honest caveats (derived-not-editorial, id/offset, not-signed, EUR-Lex CELEX-only, operator config) → Task 2 prose + Task 3 docs. ✅
- Docs refresh README/PRODUCT/GUIDE/CHANGELOG → Task 3; About PDF regen = release-tail (excluded, per spec §7). ✅
- Tests: page + rail component tests (Task 2), playground guard (Task 1), live e2e driving the playground incl. the honesty rule (Task 4). ✅

**Placeholder scan:** every code/prose step contains complete content; no TBD/TODO. ✅

**Type/hook consistency:** the playground's control labels (`Backed in substance`, `Every quoted claim matched its source`, `This answer made sourced claims`) and `#pill-label` element defined in Task 1 are exactly what Task 4's e2e drives; the iframe `src="/learn/playgrounds/trust-states.html"` in Task 2's page matches Task 1's filename and Task 4's `frameLocator`; the drill link `href="/learn/playgrounds/citation-engine-cascade.html"` matches the confirmed vendored file; the rail label `Fiduciary receipts` in Task 2's `AboutRail` edit matches both the page test and the e2e `getByRole('link', { name: 'Fiduciary receipts' })`. ✅
