# Unified Workflows IA Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tie Skills + Playbooks + Saved Prompts into one "Workflows" area — a hub landing page, a shared segmented sub-nav, and a consolidated single sidebar entry — without relocating any existing routes.

**Architecture:** A new presentational `WorkflowsNav` segmented control is rendered atop the new `/workflows` hub page and the three existing index pages (`/skills`, `/playbooks`, `/prompts`). The sidebar collapses its four Workflows-area entries to one "Workflows" entry whose active-state matches all four child paths. No routes move; no redirects; no backend/BFF changes.

**Tech Stack:** SvelteKit 2 + Svelte 5 (runes), Tailwind with `mlq-*` design tokens, Lucide icons, Vitest + @testing-library/svelte for unit/component tests, Playwright for live e2e against the running Docker stack.

---

## Context the implementer needs

- **Design tokens** (`src/app.css`): `mlq-subtle` (#e5e7eb, borders), `mlq-muted` (#9ca3af, labels), `mlq-text` (body), `mlq-strong` (#111827, near-black), `mlq-surface`/`mlq-surface-alt` (backgrounds), `mlq-workflow` (#2563eb, blue accent). Active sidebar entries use `bg-mlq-subtle text-mlq-strong`.
- **In-app navigation rule:** every in-app `<a href>` / `goto` MUST carry `<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- <reason> -->` immediately above it (see `Sidebar.svelte`).
- **Quality bar:** `npm run check` must report **0 errors, 0 warnings** (a harmless vendor `ERR_MODULE_NOT_FOUND` on stderr is expected — the signal is the `COMPLETED … 0 ERRORS 0 WARNINGS` line). No `any`. Run `npx vitest run` for unit tests.
- **Existing index-page shape:** each of `/skills`, `/playbooks`, `/prompts` `+page.svelte` opens with `<div class="mx-auto max-w-3xl px-4 py-6">` then a header row `<div class="mb-4 flex items-center justify-between">` (title `<h1 class="text-xl font-medium text-mlq-text">` + a "+ New …" control). We insert `<WorkflowsNav … />` as the first child inside the `max-w-3xl` container, above that header row.
- **Component-test pattern:** `import Page from './+page.svelte'; render(Page, { props: { data: … } as never })`. Mock `$app/forms` / `$app/navigation` only when the component imports them. `WorkflowsNav` imports neither, so its test needs no mocks.
- **e2e login helper** (copy verbatim into the new spec):
  ```ts
  const EMAIL = process.env.DONNA_E2E_EMAIL!;
  const PASSWORD = process.env.DONNA_E2E_PASSWORD!;
  async function login(page: any) {
    await page.goto('/login');
    await page.fill('input[name="email"]', EMAIL);
    await page.fill('input[name="password"]', PASSWORD);
    await page.click('button:has-text("Sign in")');
    await page.waitForURL('/');
  }
  ```
  Run e2e with the env loaded: `set -a; . ./.env; set +a; npx playwright test tests/workflows-ia.spec.ts`.

## File structure

- **Create** `src/lib/workflows/WorkflowsNav.svelte` — the segmented control (3 links). One responsibility: render the sub-nav with the right active segment. No I/O.
- **Create** `src/lib/workflows/WorkflowsNav.svelte.test.ts` — component test.
- **Modify** `src/routes/(app)/workflows/+page.svelte` — replace the stub with the hub.
- **Create** `src/routes/(app)/workflows/page.svelte.test.ts` — hub component test.
- **Modify** `src/routes/(app)/skills/+page.svelte`, `…/playbooks/+page.svelte`, `…/prompts/+page.svelte` — add `<WorkflowsNav active="…" />`.
- **Modify** the three existing index `page.svelte.test.ts` — add one sub-nav assertion each.
- **Modify** `src/lib/components/Sidebar.svelte` — consolidate entries + generalize `isActive`.
- **Modify** `src/lib/components/Sidebar.svelte.test.ts` — rewrite removed-entry assertions + add active-state coverage.
- **Modify** `tests/playbooks-browse.spec.ts:18` — `aside a[href="/playbooks"]` → `aside a[href="/workflows"]`.
- **Create** `tests/workflows-ia.spec.ts` — live e2e.

---

## Task 1: WorkflowsNav segmented control

**Files:**
- Create: `src/lib/workflows/WorkflowsNav.svelte`
- Test: `src/lib/workflows/WorkflowsNav.svelte.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/workflows/WorkflowsNav.svelte.test.ts`:

```ts
/// <reference types="@testing-library/jest-dom/vitest" />
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import WorkflowsNav from './WorkflowsNav.svelte';

describe('WorkflowsNav', () => {
  it('renders three segments linking to the tool routes', () => {
    render(WorkflowsNav, { props: { active: null } });
    expect(screen.getByRole('link', { name: 'Skills' })).toHaveAttribute('href', '/skills');
    expect(screen.getByRole('link', { name: 'Playbooks' })).toHaveAttribute('href', '/playbooks');
    expect(screen.getByRole('link', { name: 'Prompts' })).toHaveAttribute('href', '/prompts');
  });

  it('marks the active segment with aria-current and no others', () => {
    render(WorkflowsNav, { props: { active: 'playbooks' } });
    expect(screen.getByRole('link', { name: 'Playbooks' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'Skills' })).not.toHaveAttribute('aria-current');
    expect(screen.getByRole('link', { name: 'Prompts' })).not.toHaveAttribute('aria-current');
  });

  it('marks no segment active when active is null (the hub)', () => {
    render(WorkflowsNav, { props: { active: null } });
    for (const name of ['Skills', 'Playbooks', 'Prompts']) {
      expect(screen.getByRole('link', { name })).not.toHaveAttribute('aria-current');
    }
  });

  it('exposes the sub-nav as a labelled navigation landmark', () => {
    render(WorkflowsNav, { props: { active: 'skills' } });
    expect(screen.getByRole('navigation', { name: 'Workflows sections' })).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/workflows/WorkflowsNav.svelte.test.ts`
Expected: FAIL — cannot resolve `./WorkflowsNav.svelte` (file does not exist).

- [ ] **Step 3: Write the component**

Create `src/lib/workflows/WorkflowsNav.svelte`:

```svelte
<script lang="ts">
  type Tool = 'skills' | 'playbooks' | 'prompts';
  let { active }: { active: Tool | null } = $props();

  const segments: { id: Tool; label: string; href: string }[] = [
    { id: 'skills', label: 'Skills', href: '/skills' },
    { id: 'playbooks', label: 'Playbooks', href: '/playbooks' },
    { id: 'prompts', label: 'Prompts', href: '/prompts' }
  ];
</script>

<nav aria-label="Workflows sections" class="mb-4 inline-flex gap-1 rounded-mlq-control border border-mlq-subtle p-1">
  {#each segments as seg (seg.id)}
    <!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- workflows sub-nav link -->
    <a href={seg.href}
       aria-current={active === seg.id ? 'page' : undefined}
       class="rounded-mlq-control px-3 py-1.5 text-sm transition-colors
              {active === seg.id ? 'bg-mlq-subtle text-mlq-strong' : 'text-mlq-text hover:bg-mlq-subtle/50'}">
      {seg.label}
    </a>
  {/each}
</nav>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/workflows/WorkflowsNav.svelte.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Run the check gate**

Run: `npm run check`
Expected: `COMPLETED … 0 ERRORS 0 WARNINGS` (ignore the vendor `ERR_MODULE_NOT_FOUND` stderr line).

- [ ] **Step 6: Commit**

```bash
git add src/lib/workflows/WorkflowsNav.svelte src/lib/workflows/WorkflowsNav.svelte.test.ts
git commit -m "feat(workflows): WorkflowsNav segmented sub-nav control"
```

---

## Task 2: Workflows hub page

**Files:**
- Modify: `src/routes/(app)/workflows/+page.svelte` (replaces the 4-line stub)
- Test: `src/routes/(app)/workflows/page.svelte.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/routes/(app)/workflows/page.svelte.test.ts`:

```ts
/// <reference types="@testing-library/jest-dom/vitest" />
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import Page from './+page.svelte';

describe('/workflows hub', () => {
  it('renders the Workflows heading and the sub-nav', () => {
    render(Page);
    expect(screen.getByRole('heading', { name: 'Workflows', level: 1 })).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: 'Workflows sections' })).toBeInTheDocument();
  });

  it('renders three cards linking to each tool', () => {
    render(Page);
    expect(screen.getByRole('link', { name: /Skills/ })).toHaveAttribute('href', '/skills');
    expect(screen.getByRole('link', { name: /Playbooks/ })).toHaveAttribute('href', '/playbooks');
    expect(screen.getByRole('link', { name: /Prompts/ })).toHaveAttribute('href', '/prompts');
  });

  it('does not mark any sub-nav segment active on the hub', () => {
    render(Page);
    // The sub-nav segment links carry no aria-current on the hub.
    const nav = screen.getByRole('navigation', { name: 'Workflows sections' });
    expect(nav.querySelector('[aria-current="page"]')).toBeNull();
  });
});
```

Note: `getByRole('link', { name: /Skills/ })` would match BOTH the sub-nav "Skills" link and the card link, which is a strict-mode collision. Avoid it by giving the cards an accessible name that the regex `/Skills/` still matches but is distinct from the bare sub-nav label — the card's accessible name is the icon + "Skills" + description text, so its name is e.g. "Skills Reusable instructions …". The sub-nav link's name is exactly "Skills". To disambiguate, the test queries the card via its container. **Replace the second test with:**

```ts
  it('renders three cards linking to each tool', () => {
    render(Page);
    const cards = screen.getByTestId('workflows-cards');
    expect(within(cards).getByRole('link', { name: /Skills/ })).toHaveAttribute('href', '/skills');
    expect(within(cards).getByRole('link', { name: /Playbooks/ })).toHaveAttribute('href', '/playbooks');
    expect(within(cards).getByRole('link', { name: /Prompts/ })).toHaveAttribute('href', '/prompts');
  });
```

and add `within` to the import: `import { render, screen, within } from '@testing-library/svelte';`.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run "src/routes/(app)/workflows/page.svelte.test.ts"`
Expected: FAIL — the stub renders no heading named "Workflows" at `level 1` is actually present (`<h1>Workflows</h1>`), but the sub-nav landmark and `workflows-cards` testid are absent → the nav/cards assertions fail.

- [ ] **Step 3: Write the hub page**

Replace the entire contents of `src/routes/(app)/workflows/+page.svelte`:

```svelte
<script lang="ts">
  import { ScrollText, Library, BookMarked } from '@lucide/svelte';
  import WorkflowsNav from '$lib/workflows/WorkflowsNav.svelte';

  const cards = [
    { href: '/skills', icon: ScrollText, name: 'Skills', desc: 'Reusable instructions you attach to a chat to shape how Donna responds. Author your own or fork a built-in.' },
    { href: '/playbooks', icon: Library, name: 'Playbooks', desc: 'Standard negotiation positions Donna applies to a contract — verdicts and redlines, position by position.' },
    { href: '/prompts', icon: BookMarked, name: 'Prompts', desc: 'Saved prompt snippets you drop into the composer to reuse wording you rely on.' }
  ];
</script>

<svelte:head><title>Workflows — Donna</title></svelte:head>

<div class="mx-auto max-w-3xl px-4 py-6">
  <h1 class="mb-4 text-xl font-medium text-mlq-text">Workflows</h1>
  <WorkflowsNav active={null} />
  <div data-testid="workflows-cards" class="mt-2 grid gap-3 sm:grid-cols-3">
    {#each cards as c (c.href)}
      <!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- workflows hub card link -->
      <a href={c.href} class="block rounded-mlq-control border border-mlq-subtle p-4 hover:bg-mlq-subtle/40">
        <c.icon size={22} class="mb-2 text-mlq-workflow" />
        <span class="block text-sm font-medium text-mlq-text">{c.name}</span>
        <span class="mt-1 block text-xs text-mlq-muted">{c.desc}</span>
      </a>
    {/each}
  </div>
</div>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run "src/routes/(app)/workflows/page.svelte.test.ts"`
Expected: PASS (3 tests).

- [ ] **Step 5: Run the check gate**

Run: `npm run check`
Expected: `0 ERRORS 0 WARNINGS`.

- [ ] **Step 6: Commit**

```bash
git add "src/routes/(app)/workflows/+page.svelte" "src/routes/(app)/workflows/page.svelte.test.ts"
git commit -m "feat(workflows): build /workflows hub landing page"
```

---

## Task 3: Wire the sub-nav into the three index pages

**Files:**
- Modify: `src/routes/(app)/skills/+page.svelte`, `src/routes/(app)/playbooks/+page.svelte`, `src/routes/(app)/prompts/+page.svelte`
- Modify: the three co-located `page.svelte.test.ts` (add one assertion each)

- [ ] **Step 1: Add a failing assertion to each index page test**

In `src/routes/(app)/skills/page.svelte.test.ts`, add inside the `describe('/skills index', …)` block:

```ts
  it('renders the Workflows sub-nav with Skills active', () => {
    render(Page, props());
    const nav = screen.getByRole('navigation', { name: 'Workflows sections' });
    expect(within(nav).getByRole('link', { name: 'Skills' })).toHaveAttribute('aria-current', 'page');
  });
```

Add `within` to that file's import: `import { render, screen, within, fireEvent } from '@testing-library/svelte';` (it currently imports `render, screen, fireEvent`).

In `src/routes/(app)/playbooks/page.svelte.test.ts`, add a second `it` in the describe block:

```ts
  it('renders the Workflows sub-nav with Playbooks active', () => {
    render(Page, { props: { data: { playbooks: [] } } as never });
    const nav = screen.getByRole('navigation', { name: 'Workflows sections' });
    expect(within(nav).getByRole('link', { name: 'Playbooks' })).toHaveAttribute('aria-current', 'page');
  });
```

Update its import line to: `import { render, screen, within } from '@testing-library/svelte';` (currently `render, screen`; note this file imports `fireEvent` from `@testing-library/dom` separately — leave that as-is).

In `src/routes/(app)/prompts/page.svelte.test.ts`, add a fourth `it`:

```ts
  it('renders the Workflows sub-nav with Prompts active', () => {
    render(Page, { props: { data: { prompts: [] } } as never });
    const nav = screen.getByRole('navigation', { name: 'Workflows sections' });
    expect(within(nav).getByRole('link', { name: 'Prompts' })).toHaveAttribute('aria-current', 'page');
  });
```

Update its import to: `import { render, screen, within } from '@testing-library/svelte';` (currently `render, screen`).

- [ ] **Step 2: Run the three tests to verify the new assertions fail**

Run: `npx vitest run "src/routes/(app)/skills/page.svelte.test.ts" "src/routes/(app)/playbooks/page.svelte.test.ts" "src/routes/(app)/prompts/page.svelte.test.ts"`
Expected: the three new tests FAIL (no `navigation` named "Workflows sections" yet); the pre-existing tests still PASS.

- [ ] **Step 3: Add WorkflowsNav to the skills index**

In `src/routes/(app)/skills/+page.svelte`:

Add to the `<script>` imports (after the existing `import` lines):
```ts
  import WorkflowsNav from '$lib/workflows/WorkflowsNav.svelte';
```
Then insert the control as the first child of the `max-w-3xl` container — change:
```svelte
<div class="mx-auto max-w-3xl px-4 py-6">
  <div class="mb-4 flex items-center justify-between">
    <h1 class="text-xl font-medium text-mlq-text">Skills</h1>
```
to:
```svelte
<div class="mx-auto max-w-3xl px-4 py-6">
  <WorkflowsNav active="skills" />
  <div class="mb-4 flex items-center justify-between">
    <h1 class="text-xl font-medium text-mlq-text">Skills</h1>
```

- [ ] **Step 4: Add WorkflowsNav to the playbooks index**

In `src/routes/(app)/playbooks/+page.svelte`:

Add to the `<script>` imports:
```ts
  import WorkflowsNav from '$lib/workflows/WorkflowsNav.svelte';
```
Change:
```svelte
<div class="mx-auto max-w-3xl px-4 py-6">
  <div class="mb-4 flex items-center justify-between">
    <h1 class="text-xl font-medium text-mlq-text">Playbooks</h1>
```
to:
```svelte
<div class="mx-auto max-w-3xl px-4 py-6">
  <WorkflowsNav active="playbooks" />
  <div class="mb-4 flex items-center justify-between">
    <h1 class="text-xl font-medium text-mlq-text">Playbooks</h1>
```

- [ ] **Step 5: Add WorkflowsNav to the prompts index**

In `src/routes/(app)/prompts/+page.svelte`:

Add to the `<script>` imports:
```ts
  import WorkflowsNav from '$lib/workflows/WorkflowsNav.svelte';
```
Change:
```svelte
<div class="mx-auto max-w-3xl px-4 py-6">
  <div class="mb-4 flex items-center justify-between">
    <h1 class="text-xl font-medium text-mlq-text">Prompts</h1>
```
to:
```svelte
<div class="mx-auto max-w-3xl px-4 py-6">
  <WorkflowsNav active="prompts" />
  <div class="mb-4 flex items-center justify-between">
    <h1 class="text-xl font-medium text-mlq-text">Prompts</h1>
```

- [ ] **Step 6: Run the three index tests + full unit suite**

Run: `npx vitest run "src/routes/(app)/skills/page.svelte.test.ts" "src/routes/(app)/playbooks/page.svelte.test.ts" "src/routes/(app)/prompts/page.svelte.test.ts"`
Expected: all PASS (the new sub-nav assertions + every pre-existing test).

Then run the whole suite to confirm nothing else regressed: `npx vitest run`
Expected: all green (≈652 + the new tests).

- [ ] **Step 7: Run the check gate**

Run: `npm run check`
Expected: `0 ERRORS 0 WARNINGS`.

- [ ] **Step 8: Commit**

```bash
git add "src/routes/(app)/skills/+page.svelte" "src/routes/(app)/playbooks/+page.svelte" "src/routes/(app)/prompts/+page.svelte" "src/routes/(app)/skills/page.svelte.test.ts" "src/routes/(app)/playbooks/page.svelte.test.ts" "src/routes/(app)/prompts/page.svelte.test.ts"
git commit -m "feat(workflows): mount WorkflowsNav on the Skills/Playbooks/Prompts index pages"
```

---

## Task 4: Sidebar consolidation + active-state

**Files:**
- Modify: `src/lib/components/Sidebar.svelte`
- Modify: `src/lib/components/Sidebar.svelte.test.ts`
- Modify: `tests/playbooks-browse.spec.ts` (line 18)

- [ ] **Step 1: Rewrite the Sidebar test**

Replace the entire contents of `src/lib/components/Sidebar.svelte.test.ts`:

```ts
/// <reference types="@testing-library/jest-dom/vitest" />
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/svelte';

// Mutable pathname so we can test active-state across routes in one file.
const h = vi.hoisted(() => ({ pathname: '/' }));
vi.mock('$app/state', () => ({
  page: {
    get url() {
      return new URL('http://localhost' + h.pathname);
    }
  }
}));

import Sidebar from './Sidebar.svelte';

beforeEach(() => {
  localStorage.clear();
  h.pathname = '/';
});

describe('Sidebar', () => {
  it('has a single Workflows entry pointing at /workflows', () => {
    render(Sidebar, { props: { displayName: 'Admin' } });
    expect(screen.getByRole('link', { name: 'Workflows' })).toHaveAttribute('href', '/workflows');
  });

  it('keeps the existing Projects link', () => {
    render(Sidebar, { props: { displayName: 'Admin' } });
    expect(screen.getByRole('link', { name: 'Projects' })).toHaveAttribute('href', '/matters');
  });

  it('no longer has standalone Skills, Playbooks, or Prompts sidebar entries', () => {
    render(Sidebar, { props: { displayName: 'Admin' } });
    expect(screen.queryByRole('link', { name: 'Skills' })).toBeNull();
    expect(screen.queryByRole('link', { name: 'Playbooks' })).toBeNull();
    expect(screen.queryByRole('link', { name: 'Prompts' })).toBeNull();
  });

  it('marks Workflows active on the hub and on each child route', () => {
    for (const path of ['/workflows', '/skills', '/playbooks', '/prompts']) {
      h.pathname = path;
      const { unmount } = render(Sidebar, { props: { displayName: 'Admin' } });
      expect(screen.getByRole('link', { name: 'Workflows' })).toHaveAttribute('aria-current', 'page');
      unmount();
    }
  });

  it('does not mark Workflows active on unrelated routes', () => {
    h.pathname = '/matters';
    render(Sidebar, { props: { displayName: 'Admin' } });
    expect(screen.getByRole('link', { name: 'Workflows' })).not.toHaveAttribute('aria-current');
  });

  it('marks Assistant active only on exactly /', () => {
    h.pathname = '/';
    const { unmount } = render(Sidebar, { props: { displayName: 'Admin' } });
    expect(screen.getByRole('link', { name: 'Assistant' })).toHaveAttribute('aria-current', 'page');
    unmount();
    h.pathname = '/matters';
    render(Sidebar, { props: { displayName: 'Admin' } });
    expect(screen.getByRole('link', { name: 'Assistant' })).not.toHaveAttribute('aria-current');
  });
});
```

- [ ] **Step 2: Run the Sidebar test to verify it fails**

Run: `npx vitest run src/lib/components/Sidebar.svelte.test.ts`
Expected: FAIL — `getByRole('link', { name: 'Workflows' })` resolves, but `queryByRole('link', { name: 'Skills' })` is still present (entries not yet removed) and the active-state for child routes is wrong (current `isActive` only matches `startsWith('/workflows')`).

- [ ] **Step 3: Edit the Sidebar component**

In `src/lib/components/Sidebar.svelte`:

Change the icon import (line 3) — drop `ScrollText, Library, BookMarked`:
```ts
  import { MessageSquare, FolderKanban, Workflow, Table, PanelLeft, LogOut } from '@lucide/svelte';
```

Replace the `nav` array and `isActive` (lines 9–21) with:
```ts
  type NavItem = { href: string; label: string; icon: typeof MessageSquare; match?: string[] };
  const nav: NavItem[] = [
    { href: '/', label: 'Assistant', icon: MessageSquare },
    { href: '/matters', label: 'Projects', icon: FolderKanban },
    { href: '/workflows', label: 'Workflows', icon: Workflow, match: ['/workflows', '/skills', '/playbooks', '/prompts'] },
    { href: '/tabular', label: 'Tabular', icon: Table }
  ];

  function toggle() { open = !open; persistSidebar(open); }
  const isActive = (item: NavItem) =>
    item.href === '/'
      ? page.url.pathname === '/'
      : (item.match ?? [item.href]).some((p) => page.url.pathname.startsWith(p));
```

Update the template call site (the `{#each}` block) — change `aria-current={isActive(item.href) ? 'page' : undefined}` and the class ternary to take `item`:
```svelte
    {#each nav as item (item.href)}
      <!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- sidebar nav link -->
      <a href={item.href}
         aria-current={isActive(item) ? 'page' : undefined}
         class="flex items-center gap-3 rounded-mlq-control px-3 py-2 text-sm hover:bg-mlq-subtle
                {isActive(item) ? 'bg-mlq-subtle text-mlq-strong' : 'text-mlq-text'}">
        <item.icon size={18} />
        {#if open}<span>{item.label}</span>{/if}
      </a>
    {/each}
```

(The `let open = $state(loadSidebar());` line and the `<aside>`/logout markup are unchanged.)

- [ ] **Step 4: Run the Sidebar test to verify it passes**

Run: `npx vitest run src/lib/components/Sidebar.svelte.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Fix the playbooks-browse e2e sidebar assertion**

In `tests/playbooks-browse.spec.ts`, line 18, change:
```ts
  await expect(page.locator('aside a[href="/playbooks"]')).toBeVisible();
```
to:
```ts
  await expect(page.locator('aside a[href="/workflows"]')).toBeVisible();
```
(The rest of that test reaches `/playbooks` via `page.goto('/playbooks')`, so it is unaffected.)

- [ ] **Step 6: Run the check gate + full unit suite**

Run: `npm run check`
Expected: `0 ERRORS 0 WARNINGS`.

Run: `npx vitest run`
Expected: all green.

- [ ] **Step 7: Commit**

```bash
git add src/lib/components/Sidebar.svelte src/lib/components/Sidebar.svelte.test.ts tests/playbooks-browse.spec.ts
git commit -m "feat(workflows): consolidate sidebar to one Workflows entry with child active-state"
```

---

## Task 5: Live e2e for the unified area

**Files:**
- Create: `tests/workflows-ia.spec.ts`

- [ ] **Step 1: Write the e2e spec**

Create `tests/workflows-ia.spec.ts`:

```ts
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

test('unified Workflows area: hub, sub-nav switching, sidebar consolidation', async ({ page }) => {
  await login(page);

  // Sidebar shows a single Workflows entry; the old standalone entries are gone.
  const sidebar = page.locator('aside');
  await expect(sidebar.locator('a[href="/workflows"]')).toBeVisible();
  await expect(sidebar.locator('a[href="/skills"]')).toHaveCount(0);
  await expect(sidebar.locator('a[href="/playbooks"]')).toHaveCount(0);
  await expect(sidebar.locator('a[href="/prompts"]')).toHaveCount(0);

  // Hub: heading + three cards.
  await sidebar.locator('a[href="/workflows"]').click();
  await page.waitForURL('**/workflows');
  await expect(page.getByRole('heading', { name: 'Workflows', level: 1 })).toBeVisible();
  const cards = page.getByTestId('workflows-cards');
  await expect(cards.getByRole('link', { name: /Skills/ })).toBeVisible();
  await expect(cards.getByRole('link', { name: /Playbooks/ })).toBeVisible();
  await expect(cards.getByRole('link', { name: /Prompts/ })).toBeVisible();

  // Sub-nav switching: each segment lands on its route and is marked active,
  // and the sidebar Workflows entry stays highlighted throughout.
  const subnav = page.getByRole('navigation', { name: 'Workflows sections' });
  for (const [label, path] of [['Skills', '/skills'], ['Playbooks', '/playbooks'], ['Prompts', '/prompts']] as const) {
    await subnav.getByRole('link', { name: label }).click();
    await page.waitForURL('**' + path);
    await expect(page.getByRole('navigation', { name: 'Workflows sections' }).getByRole('link', { name: label })).toHaveAttribute('aria-current', 'page');
    await expect(sidebar.locator('a[href="/workflows"]')).toHaveAttribute('aria-current', 'page');
  }
});
```

- [ ] **Step 2: Ensure the stack is up, then run the e2e**

Confirm the app responds: `curl -s -o /dev/null -w "%{http_code}" http://localhost:13002/` → expect `303` (or `200`). If not, bring the stack up per `donna-dev-stack` memory.

Run: `set -a; . ./.env; set +a; npx playwright test tests/workflows-ia.spec.ts`
Expected: `1 passed`.

- [ ] **Step 3: Commit**

```bash
git add tests/workflows-ia.spec.ts
git commit -m "test(workflows): live e2e for unified hub + sub-nav + sidebar consolidation"
```

---

## Final verification (after all tasks)

- [ ] `npm run check` → `0 ERRORS 0 WARNINGS`.
- [ ] `npx vitest run` → all unit/component tests green.
- [ ] `set -a; . ./.env; set +a; npx playwright test tests/workflows-ia.spec.ts tests/playbooks-browse.spec.ts` → both green (confirms the sidebar fix didn't break playbooks-browse).
- [ ] Manual smoke at http://localhost:13002/workflows: hub renders, three cards navigate, sub-nav switches with correct highlight, sidebar shows one Workflows entry highlighted on all four routes.
- [ ] Whole-branch review (opus), then `superpowers:finishing-a-development-branch` → PR into `main`.

## Notes / non-goals (do not implement)

- No transparency surfaces (counts, recent activity, usage). Pure nav hub.
- No route relocation under `/workflows/*`; no redirects.
- Do NOT add `WorkflowsNav` to deep sub-pages (skill editor `/skills/[id]`, playbook `/playbooks/new`, `/playbooks/[id]/run`, prompt modals) — index pages + hub only.
- The skill **detail** page (`/skills/[id]`) keeps its own existing "Skills" breadcrumb; do not touch it. (Its test `skills/[id]/page.svelte.test.ts:19` asserts that breadcrumb and must remain unchanged.)
- **Future fast-follow (not now):** an "autonomous workflows" surface once the LQ_AI backend ships it — this area is built to extend to it. See the spec's Future work section.
```
