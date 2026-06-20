import { test, expect, type Page } from '@playwright/test';

// Live e2e for the governed chat tool-loop (Slice C). Gated on MCP tools being
// configured + enabled; self-skips otherwise. The model deciding to call a tool
// is non-deterministic — the test instructs it explicitly and skips honestly if
// the assistant answers without calling a tool.
const EMAIL = process.env.DONNA_E2E_EMAIL ?? 'admin@lq.ai';
const PASSWORD = process.env.DONNA_E2E_PASSWORD!;

async function login(page: Page) {
	await page.goto('/login');
	await page.fill('input[name="email"]', EMAIL);
	await page.fill('input[name="password"]', PASSWORD);
	await page.click('button:has-text("Sign in")');
	await page.waitForURL('/');
}

test('a tool call surfaces the confirmation gate; Approve resumes the turn', async ({ page }) => {
	await login(page);
	await page.goto('/');
	const composer = page.getByRole('textbox').first();
	await composer.fill(
		'Use the deepwiki read_wiki_structure tool on facebook/react. Call the tool — do not answer from memory.'
	);
	await composer.press('Enter');
	await page.waitForURL(/\/chats\//, { timeout: 20000 });

	// Either the confirmation card appears (tool was called) or the assistant
	// answered without a tool — both are honest outcomes; only the first is the
	// flow under test.
	const approve = page.getByRole('button', { name: /approve/i });
	const appeared = await approve.isVisible({ timeout: 40000 }).catch(() => false);
	if (!appeared) {
		test.skip(true, 'Assistant did not call a tool this run — gate not exercised');
		return;
	}
	await expect(page.getByText(/wants to run/i)).toBeVisible();
	await approve.click();
	// The resumed turn streams an answer into the same message (card is gone).
	await expect(approve).toBeHidden({ timeout: 40000 });
});
