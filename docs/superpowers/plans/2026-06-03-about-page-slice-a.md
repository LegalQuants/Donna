# About Page (Slice 2a) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a sidebar "About" entry (above Settings) opening a comprehensive, instructional "About Donna" guide — a rail + page-per-topic surface mirroring `/settings` — with a "Powered by LQ-AI" callout to an `/about/lq-ai` stub (expanded in slice 2b).

**Architecture:** Pure-frontend SvelteKit. Mirror the existing `/settings` pattern: a redirecting `+page.server.ts`, a `+layout.svelte` two-column shell, and a rail component (`AboutRail.svelte`). Eight topic `+page.svelte` files hold instructional prose grounded in the real feature code. One sidebar edit adds the nav entry. No backend/BFF/vendor change.

**Tech Stack:** SvelteKit 2 / Svelte 5 runes, Tailwind with `mlq-*` design tokens, `@lucide/svelte`, Playwright e2e.

**Spec:** `docs/superpowers/specs/2026-06-03-about-page-design.md`

**Execution order:** Task 1 (skeleton) → Task 2 (e2e) → Tasks 3–10 (content pages, independent of each other; each only edits its own `+page.svelte`). The content tasks may be done in any order once the skeleton exists.

---

### Task 1: `/about` navigation skeleton + sidebar entry

Build the full navigable IA: redirect, rail, layout+callout, the `/about/lq-ai` stub, eight topic pages with **placeholder** bodies (real `<svelte:head>`/`<h1>` so the rail resolves and the e2e passes), and the sidebar "About" link. Tasks 3–10 replace the placeholder bodies with real content.

**Files:**

- Create: `src/routes/(app)/about/+page.server.ts`
- Create: `src/lib/about/AboutRail.svelte`
- Create: `src/routes/(app)/about/+layout.svelte`
- Create: `src/routes/(app)/about/lq-ai/+page.svelte`
- Create: `src/routes/(app)/about/{overview,assistant,projects,workflows,tabular,knowledge,models,trust}/+page.svelte` (8 files)
- Modify: `src/lib/components/Sidebar.svelte`

- [ ] **Step 1: Redirect `/about` → `/about/overview`**

Create `src/routes/(app)/about/+page.server.ts` (mirrors `settings/+page.server.ts`):

```ts
import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = () => {
	throw redirect(307, '/about/overview');
};
```

- [ ] **Step 2: The rail component**

Create `src/lib/about/AboutRail.svelte` (mirrors `src/lib/settings/SettingsRail.svelte`):

```svelte
<script lang="ts">
	import { page } from '$app/state';

	const sections: { href: string; label: string }[] = [
		{ href: '/about/overview', label: 'Overview' },
		{ href: '/about/assistant', label: 'Assistant' },
		{ href: '/about/projects', label: 'Projects' },
		{ href: '/about/workflows', label: 'Workflows' },
		{ href: '/about/tabular', label: 'Tabular' },
		{ href: '/about/knowledge', label: 'Knowledge' },
		{ href: '/about/models', label: 'Models' },
		{ href: '/about/trust', label: 'Trust & citations' }
	];
	const isActive = (href: string) =>
		page.url.pathname === href || page.url.pathname.startsWith(href + '/');
</script>

<nav aria-label="About sections" class="flex flex-row gap-1 sm:w-44 sm:flex-col">
	{#each sections as s (s.href)}
		<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- about section link -->
		<a
			href={s.href}
			aria-current={isActive(s.href) ? 'page' : undefined}
			class="rounded-mlq-control px-3 py-2 text-sm transition-colors focus-visible:ring-2 focus-visible:ring-mlq-workflow focus-visible:outline-none
              {isActive(s.href)
				? 'bg-mlq-subtle text-mlq-strong'
				: 'text-mlq-text hover:bg-mlq-subtle/50'}"
		>
			{s.label}
		</a>
	{/each}
</nav>
```

- [ ] **Step 3: The layout shell + "Powered by LQ-AI" callout**

Create `src/routes/(app)/about/+layout.svelte` (mirrors `settings/+layout.svelte`, adds the callout above the two-column row):

```svelte
<script lang="ts">
	import { ArrowRight } from '@lucide/svelte';
	import AboutRail from '$lib/about/AboutRail.svelte';
	let { children } = $props();
</script>

<div class="mx-auto flex max-w-3xl flex-col gap-4 px-4 py-6">
	<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- powered-by callout -->
	<a
		href="/about/lq-ai"
		class="flex items-center justify-between gap-3 rounded-mlq-control border border-mlq-subtle bg-mlq-subtle/30 px-4 py-3 text-sm transition-colors hover:bg-mlq-subtle/60"
	>
		<span class="text-mlq-text"
			>Donna is powered by <span class="font-medium text-mlq-strong">LQ-AI</span>, an open-source
			legal operating system — learn how it works.</span
		>
		<ArrowRight size={16} class="shrink-0 text-mlq-muted" />
	</a>
	<div class="flex flex-col gap-6 sm:flex-row">
		<AboutRail />
		<div class="min-w-0 flex-1">{@render children()}</div>
	</div>
</div>
```

- [ ] **Step 4: The `/about/lq-ai` stub page**

Create `src/routes/(app)/about/lq-ai/+page.svelte`. The intro text is the user-approved copy; the link points to the LQ-AI repo. Slice 2b replaces this body with the full mirror.

```svelte
<svelte:head><title>Powered by LQ-AI — About Donna</title></svelte:head>

<h1 class="mb-4 text-xl font-medium text-mlq-text">Powered by LQ-AI</h1>

<p class="mb-4 max-w-prose text-sm leading-relaxed text-mlq-text">
	Donna is powered by LQ-AI, an open source legal operating system. Donna uses some, but not all, of
	the functionality available in LQ-AI. You can learn how LQ-AI (and Donna) work below.
</p>

<p class="text-sm text-mlq-muted">
	A full “How it works” walkthrough is coming soon. In the meantime, explore the open-source
	project:
	<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- external repo link -->
	<a
		href="https://github.com/LegalQuants/lq-ai"
		target="_blank"
		rel="noopener noreferrer"
		class="font-medium text-mlq-strong underline">LegalQuants / lq-ai on GitHub</a
	>.
</p>
```

- [ ] **Step 5: Eight placeholder topic pages**

Create each of the 8 files below. Each is a minimal placeholder with the correct `<title>` and `<h1>` so the rail resolves and the e2e passes; Tasks 3–10 fill in real content. Use this exact shape, substituting `TITLE` and `HEADING` per the table:

```svelte
<svelte:head><title>TITLE — About Donna</title></svelte:head>

<h1 class="mb-4 text-xl font-medium text-mlq-text">HEADING</h1>

<p class="max-w-prose text-sm leading-relaxed text-mlq-muted">
	Guide content coming in this slice.
</p>
```

| File                           | TITLE               | HEADING             |
| ------------------------------ | ------------------- | ------------------- |
| `about/overview/+page.svelte`  | `Overview`          | `About Donna`       |
| `about/assistant/+page.svelte` | `Assistant`         | `The Assistant`     |
| `about/projects/+page.svelte`  | `Projects`          | `Projects`          |
| `about/workflows/+page.svelte` | `Workflows`         | `Workflows`         |
| `about/tabular/+page.svelte`   | `Tabular`           | `Tabular review`    |
| `about/knowledge/+page.svelte` | `Knowledge`         | `Knowledge bases`   |
| `about/models/+page.svelte`    | `Models`            | `Models`            |
| `about/trust/+page.svelte`     | `Trust & citations` | `Trust & citations` |

- [ ] **Step 6: Sidebar "About" entry above Settings**

In `src/lib/components/Sidebar.svelte`:

(a) Add `Info` to the lucide import on line 3:

```svelte
import {(MessageSquare, FolderKanban, Workflow, Table, PanelLeft, LogOut, Settings, Info)} from '@lucide/svelte';
```

(b) In the footer `<div class="space-y-1 border-t border-mlq-subtle p-2">` (line 46), insert the About link **immediately before** the Settings link (the `<!-- ... settings link -->` comment on line 47):

```svelte
<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- about link -->
<a
	href="/about"
	aria-current={page.url.pathname.startsWith('/about') ? 'page' : undefined}
	class="flex items-center gap-3 rounded-mlq-control px-3 py-2 text-sm hover:bg-mlq-subtle
              {page.url.pathname.startsWith('/about')
		? 'bg-mlq-subtle text-mlq-strong'
		: 'text-mlq-text'}"
>
	<Info size={18} />
	{#if open}<span>About</span>{/if}
</a>
```

- [ ] **Step 7: Run the gate**

Run: `npm run check`
Expected: 0 errors / 0 warnings (the vendor `ERR_MODULE_NOT_FOUND` stderr line is harmless/pre-existing).

- [ ] **Step 8: Run the unit suite (no regressions)**

Run: `npx vitest run`
Expected: green (no Donna unit tests assert on the sidebar's absence of an About link; ~909–910 pass).

- [ ] **Step 9: Commit**

```bash
git add "src/routes/(app)/about" "src/lib/about/AboutRail.svelte" "src/lib/components/Sidebar.svelte"
git commit -m "feat(about): /about IA skeleton — rail, layout, lq-ai stub, sidebar entry"
```

---

### Task 2: e2e — navigation + callout

**Files:**

- Create: `tests/about.spec.ts`

- [ ] **Step 1: Write the e2e spec**

Create `tests/about.spec.ts` (mirror the `login()` helper from `tests/model-settings.spec.ts`):

```ts
import { test, expect, type Page } from '@playwright/test';

const EMAIL = process.env.DONNA_E2E_EMAIL!;
const PASSWORD = process.env.DONNA_E2E_PASSWORD!;

async function login(page: Page) {
	await page.goto('/login');
	await page.fill('input[name="email"]', EMAIL);
	await page.fill('input[name="password"]', PASSWORD);
	await page.click('button:has-text("Sign in")');
	await page.waitForURL('/');
}

test('About lives above Settings in the sidebar and opens the guide', async ({ page }) => {
	await login(page);

	// Sidebar shows About, positioned above Settings.
	const nav = page.locator('aside');
	const about = nav.getByRole('link', { name: 'About' });
	const settings = nav.getByRole('link', { name: 'Settings' });
	await expect(about).toBeVisible();
	await expect(settings).toBeVisible();
	const aboutBox = await about.boundingBox();
	const settingsBox = await settings.boundingBox();
	expect(aboutBox!.y).toBeLessThan(settingsBox!.y);

	// Clicking About lands on the Overview topic (via the /about redirect).
	await about.click();
	await expect(page).toHaveURL(/\/about\/overview$/);
	await expect(page.getByRole('heading', { name: 'About Donna', level: 1 })).toBeVisible();
});

test('the About rail navigates between topics and marks the active one', async ({ page }) => {
	await login(page);
	await page.goto('/about/overview');

	// Scope to the About rail — the sidebar also has a "Tabular" link, so a
	// page-wide locator would hit Playwright strict-mode collision.
	const rail = page.locator('nav[aria-label="About sections"]');
	const railTabular = rail.getByRole('link', { name: 'Tabular', exact: true });
	await railTabular.click();
	await expect(page).toHaveURL(/\/about\/tabular$/);
	await expect(page.getByRole('heading', { name: 'Tabular review', level: 1 })).toBeVisible();
	await expect(railTabular).toHaveAttribute('aria-current', 'page');
});

test('the Powered by LQ-AI callout reaches the lq-ai page', async ({ page }) => {
	await login(page);
	await page.goto('/about/overview');

	await page.getByRole('link', { name: /powered by/i }).click();
	await expect(page).toHaveURL(/\/about\/lq-ai$/);
	await expect(page.getByRole('heading', { name: 'Powered by LQ-AI', level: 1 })).toBeVisible();
	await expect(page.getByText(/open source legal operating system/i)).toBeVisible();
});
```

- [ ] **Step 2: Type-check**

Run: `npm run check`
Expected: 0 errors / 0 warnings.

- [ ] **Step 3: Commit**

```bash
git add tests/about.spec.ts
git commit -m "test(about): e2e — sidebar entry, rail navigation, lq-ai callout"
```

> The controller runs this spec live (after rebuilding `donna-web`) during verification — see "Live verification" at the end. Note the rail test already scopes its `Tabular` locator to `nav[aria-label="About sections"]` to avoid colliding with the sidebar's `Tabular` link (Playwright strict mode).

---

### Content tasks (3–10): one instructional page each

**Applies to every content task below.** Each task replaces the placeholder body of one `+page.svelte` (created in Task 1) with comprehensive, accurate, instructional prose. Rules for all of them:

- **Read the real feature first** (files listed per task) so every instruction matches what's actually on screen — correct button/label names, routes, and behavior. Do **not** invent features Donna doesn't have.
- Keep the existing `<svelte:head><title>…</title>` and the `<h1 class="mb-4 text-xl font-medium text-mlq-text">…</h1>` from Task 1.
- Structure the body with `<h2 class="mb-2 mt-6 text-sm font-medium uppercase tracking-wide text-mlq-muted">` section headings, `<p class="mb-3 max-w-prose text-sm leading-relaxed text-mlq-text">` paragraphs, and `<ul class="mb-3 ml-4 list-disc space-y-1 text-sm text-mlq-text">` lists. Reference on-screen elements in prose (e.g. "the **✦ Enhance** button", "the **Projects** item in the sidebar"). No screenshots, no external images.
- Use only `mlq-*` design tokens already used elsewhere. No new dependencies, no `<script>` logic unless a task says so (these are static content pages).
- Run `npm run check` (expect 0/0) before committing. Commit message: `docs(about): <topic> guide page`.
- Scope: edit only this task's single `+page.svelte`. If you find the page would duplicate another topic, keep it focused and cross-reference in prose ("see the Assistant page").

#### Task 3: Overview page

**File:** `src/routes/(app)/about/overview/+page.svelte`
**Read first:** `src/routes/(app)/+page.svelte` (landing), `src/lib/components/Sidebar.svelte` (the nav: Assistant, Projects, Workflows, Tabular), `src/lib/brand.ts` (the Donna rebrand).

- [ ] **Step 1:** Write the Overview content covering: what Donna is (a friendly frontend over the open-source LQ-AI legal backend — link to the Powered-by-LQ-AI callout/page in prose); a short tour of the left sidebar (Assistant, Projects, Workflows, Tabular, About, Settings); how this guide is organized (one page per area); and the standing reminders (answers are not legal advice). End by pointing to the Assistant page as the place to start.
- [ ] **Step 2:** Run `npm run check` (0/0).
- [ ] **Step 3:** Commit: `git add "src/routes/(app)/about/overview/+page.svelte" && git commit -m "docs(about): overview guide page"`.

#### Task 4: Assistant page

**File:** `src/routes/(app)/about/assistant/+page.svelte`
**Read first:** `src/lib/components/Composer.svelte`, `src/routes/(app)/+page.svelte` (landing composer), `src/routes/(app)/chats/[id]/+page.svelte` (in-chat), `src/lib/enhance/` (prompt-enhance), `src/lib/components/ReceiptsDrawer.svelte` + citation pill components, `src/lib/skills/attach.svelte`, `src/lib/files/fileAttach.svelte`, `src/lib/models/`.

- [ ] **Step 1:** Write the Assistant content covering: starting a conversation from the landing composer vs. continuing in a chat; the **✦ Enhance** prompt-enhancer (what it does, preview → accept); attaching **skills** and **files** to a message; choosing a **model** in the composer; and reading answers — citations/pills and the **receipts** drawer. Cross-reference Models and Trust pages.
- [ ] **Step 2:** Run `npm run check` (0/0).
- [ ] **Step 3:** Commit: `docs(about): assistant guide page`.

#### Task 5: Projects page

**File:** `src/routes/(app)/about/projects/+page.svelte`
**Read first:** `src/routes/(app)/matters/` (list/detail pages), `src/lib/matters/` (e.g. `MatterBadge.svelte`, `PrivilegedChip.svelte`), `src/routes/(app)/files/` and `src/lib/files/` for matter file attachment.

- [ ] **Step 1:** Write the Projects content covering: what a Project (matter) is and why to use one; creating a Project; privilege/anonymization signalling (the privileged chip / minimum tier floor); attaching files to a Project; and how scoping a chat to a Project changes context. Note the sidebar label is **Projects** (route `/matters`).
- [ ] **Step 2:** Run `npm run check` (0/0).
- [ ] **Step 3:** Commit: `docs(about): projects guide page`.

#### Task 6: Workflows page

**File:** `src/routes/(app)/about/workflows/+page.svelte`
**Read first:** `src/routes/(app)/workflows/`, `src/routes/(app)/skills/` + `src/lib/skills/` (authoring/fork/inputs), `src/routes/(app)/playbooks/` (browse/apply/author), `src/routes/(app)/prompts/` + `src/lib/prompts/` (saved prompts / prompt library).

- [ ] **Step 1:** Write the Workflows content covering the **Workflows** hub and its three pillars: **Skills** (what they are, applying them, authoring/forking, skill inputs), **Playbooks** (browsing, applying to a chat, authoring), and **Saved prompts** (the prompt library in the composer). Note the sidebar **Workflows** entry also covers `/skills`, `/playbooks`, `/prompts`.
- [ ] **Step 2:** Run `npm run check` (0/0).
- [ ] **Step 3:** Commit: `docs(about): workflows guide page`.

#### Task 7: Tabular page

**File:** `src/routes/(app)/about/tabular/+page.svelte`
**Read first:** `src/routes/(app)/tabular/` and `src/routes/(app)/tabular-executions/`, plus the tabular components under `src/lib/` (grid, column config, citation/source navigation).

- [ ] **Step 1:** Write the Tabular content covering: what Tabular review is (running a question grid across documents); defining **columns** (and per-column model tier / table-skill mode if present); running a review; navigating from a **cell to its source citation**; and history/resume of past runs. Keep claims to what the UI actually exposes.
- [ ] **Step 2:** Run `npm run check` (0/0).
- [ ] **Step 3:** Commit: `docs(about): tabular guide page`.

#### Task 8: Knowledge page

**File:** `src/routes/(app)/about/knowledge/+page.svelte`
**Read first:** `src/routes/(app)/knowledge/` and `src/lib/knowledge/` (e.g. `CreateKbForm.svelte`, `KbRenameModal.svelte`).

- [ ] **Step 1:** Write the Knowledge content covering: what a Knowledge base is; creating and naming a KB; uploading documents (note **`.pdf` ingests reliably; some file types are unsupported**); and how KB content is retrieved (RAG) to ground answers with citations. Cross-reference the Trust page for citations.
- [ ] **Step 2:** Run `npm run check` (0/0).
- [ ] **Step 3:** Commit: `docs(about): knowledge guide page`.

#### Task 9: Models page

**File:** `src/routes/(app)/about/models/+page.svelte`
**Read first:** `src/routes/(app)/settings/models/+page.svelte`, `src/lib/inference/` (categories/`CategoryRow.svelte`), `src/lib/models/` (composer model picker + `pickValidModel`).

- [ ] **Step 1:** Write the Models content covering: choosing a model per message in the composer (the tiers, e.g. smart/fast); and the **Settings → Models** surface — per-category routing (admins can reassign a category's backing model; non-admins see it read-only) and the installed **local models** card. Note provider API keys are environment-managed. Link to `/settings/models` in prose.
- [ ] **Step 2:** Run `npm run check` (0/0).
- [ ] **Step 3:** Commit: `docs(about): models guide page`.

#### Task 10: Trust & citations page

**File:** `src/routes/(app)/about/trust/+page.svelte`
**Read first:** `src/lib/components/ReceiptsDrawer.svelte`, the citation pill / highlight components, the anonymization indicator component (grep `anonymiz`), and the "not legal advice" notice in `src/routes/(app)/+page.svelte` / chat page.

- [ ] **Step 1:** Write the Trust & citations content covering: how Donna cites sources (citation pills, click-through to the document/source); the **receipts** drawer (what evidence a message was built from); **anonymization** of sensitive content; and the standing disclaimer that answers are **not legal advice**.
- [ ] **Step 2:** Run `npm run check` (0/0).
- [ ] **Step 3:** Commit: `docs(about): trust & citations guide page`.

---

## Live verification (controller-run, after all tasks)

1. Rebuild the web container (serves built code): `set -a; . ./.env; set +a` then `docker compose up -d --build donna-web`.
2. Run the e2e: `set -a; . ./.env; set +a; npx playwright test about.spec.ts` — expect 3 passed.
3. Spot-check `/about/overview` and a couple of topic pages render the real content with native styling, and the "Powered by LQ-AI" callout reaches the stub.

## Notes for the executor

- **Gate bar:** `npm run check` = 0 errors / 0 warnings is THE bar. `npm run lint` has ~53 pre-existing errors on `main` (unadopted svelte rules) — do **not** treat those as regressions; add no new ones. Use the `<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->` comment above every internal `<a href>` exactly as the existing sidebar/rail code does.
- **Do not** touch backend, BFF proxies, or `vendor/` — this slice is frontend-only.
- The `/about/lq-ai` page is intentionally a stub; slice 2b expands it. Do not build the LQ-AI mirror here.
- After execution: whole-branch Opus review, then `finishing-a-development-branch` → PR.
