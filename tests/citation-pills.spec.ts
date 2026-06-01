// tests/citation-pills.spec.ts
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

// A crafted assistant turn with three states + an out-of-range marker.
const CONTENT =
  'Green "thirty days notice" (Source: [1]); ' +
  'yellow "obligations survive" (Source: [2]); ' +
  'red "unsupported claim" (Source: [3]); ' +
  'missing "no citation" (Source: [9]).';

const SSE = [
  'data: {"type":"start","lq_ai_message_id":"m_fixed","chat_id":"c"}\n\n',
  `data: {"type":"complete","lq_ai_message_id":"m_fixed","message":{"id":"m_fixed","content":${JSON.stringify(CONTENT)},"routed_inference_tier":4}}\n\n`,
  'data: [DONE]\n\n'
].join('');

const CITATIONS = [
  { id: 'a', source_file_id: 'file-1', source_text: 'thirty days notice', source_page: 1, verified: true, partial: false, verification_method: 'exact_match', verification_confidence: 1 },
  { id: 'b', source_file_id: 'file-1', source_text: 'obligations survive', source_page: 2, verified: true, partial: true, verification_method: 'paraphrase_judge', verification_confidence: 0.7 },
  { id: 'c', source_file_id: 'file-1', source_text: 'unsupported claim', source_page: 3, verified: false, partial: false }
];

test('renders three citation states and an out-of-range pill, with a working popover', async ({ page }) => {
  await login(page);

  // Intercept the browser-side BFF calls (SSE stream, citations, filename).
  await page.route('**/chats/*/messages', (route) =>
    route.fulfill({ status: 200, headers: { 'content-type': 'text/event-stream' }, body: SSE })
  );
  await page.route('**/messages/*/citations', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(CITATIONS) })
  );
  await page.route('**/files/*', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ filename: 'MSA.pdf' }) })
  );

  await page.fill('textarea', 'cite something');
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/chats\/[0-9a-f-]+/i);

  // Three states render + the out-of-range marker renders unverified.
  await expect(page.locator('.cite-tab.cite-verified')).toHaveCount(1);
  await expect(page.locator('.cite-tab.cite-caveats')).toHaveCount(1);
  await expect(page.locator('.cite-tab.cite-unverified')).toHaveCount(2); // [3] + [9]

  // Focus the green tab → hover/focus popover with the source quote + filename.
  // (Since P3-2 the popover is hover/focus-triggered; click opens the doc panel,
  // which is covered by document-panel.spec.ts / citation-highlight.spec.ts.)
  await page.locator('.cite-tab.cite-verified').focus();
  const pop = page.getByRole('dialog');
  await expect(pop).toBeVisible();
  await expect(pop).toContainText('thirty days notice');
  await expect(pop).toContainText('MSA.pdf');
  await expect(pop).toContainText(/exact match/i);

  // Esc closes (the focused pill's keydown bubbles to the cite-view handler).
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);

  // The out-of-range [9] shows the "could not be matched" empty state on focus.
  await page.locator('.cite-tab.cite-unverified').last().focus();
  await expect(page.getByRole('dialog')).toContainText(/could not be matched/i);
});
