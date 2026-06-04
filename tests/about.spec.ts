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

test('the Powered by LQ-AI page renders How-It-Works sections + Build & Learn', async ({ page }) => {
  await login(page);
  await page.goto('/about/overview');

  await page.getByRole('link', { name: /powered by/i }).click();
  await expect(page).toHaveURL(/\/about\/lq-ai$/);
  await expect(page.getByRole('heading', { name: 'Powered by LQ-AI', level: 1 })).toBeVisible();
  await expect(page.getByText(/open source legal operating system/i)).toBeVisible();

  // A How-It-Works section + its embedded playground iframe.
  await expect(page.getByRole('heading', { name: '1. The big picture: System Architecture', level: 2 })).toBeVisible();
  await expect(page.locator('iframe[src="/learn/playgrounds/system-architecture.html"]')).toHaveCount(1);

  // The authored closing section.
  await expect(page.getByRole('heading', { name: /Build & learn with LQ-AI/i, level: 2 })).toBeVisible();
});

test('How It Works links to How to Build, which renders the Skill Format playground', async ({ page }) => {
  await login(page);
  await page.goto('/about/lq-ai');

  await page.getByRole('link', { name: /how to build on LQ-AI/i }).click();
  await expect(page).toHaveURL(/\/about\/lq-ai\/build$/);
  await expect(page.getByRole('heading', { name: /How to Build/i, level: 1 })).toBeVisible();
  await expect(page.getByRole('heading', { name: /skill/i }).first()).toBeVisible();
  await expect(page.locator('iframe[src="/learn/playgrounds/skill-format.html"]')).toHaveCount(1);

  // Back-link returns to How It Works.
  await page.getByRole('link', { name: /← How it works/i }).click();
  await expect(page).toHaveURL(/\/about\/lq-ai$/);
});
