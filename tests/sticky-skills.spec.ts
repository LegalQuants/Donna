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

// Verifies the per-chat "Keep skills on" toggle: once a skill is snapshotted into the chat's
// sticky set, it carries to follow-up turns even with NO skill attached in the composer — and
// stops the moment the toggle is turned off. The composer KEEPS the attached chip after a send,
// so we remove the chip before the sticky-only turn to prove it's STICKY (not the lingering
// attach) that forwards the skill. Built-in `comms-improver` is used (no skill to clean up); it
// has two required inputs (text, audience) that block send until filled, so we fill them on the
// turns where it's attached. The applied-skills footer renders a link named "Comms Improver" on
// each turn that applied it.
test('sticky skills carry an applied skill across follow-up turns until toggled off', async ({
	page
}) => {
	test.setTimeout(360000); // five real streamed LLM turns

	await login(page);

	const composer = page.getByRole('textbox', { name: 'Ask a question about your documents…' });
	const appliedLinks = page.getByRole('link', { name: 'Comms Improver' });
	const copyButtons = page.getByRole('button', { name: /copy/i });
	const TURN = { timeout: 90000 };

	// Turn 1 — open a chat with a plain message (no skill).
	await page.fill('textarea', 'In one short sentence, what is plain-language legal writing?');
	await page.keyboard.press('Enter');
	await expect(page).toHaveURL(/\/chats\/[0-9a-f-]+/i);
	await expect(copyButtons).toHaveCount(1, TURN);
	await expect(appliedLinks).toHaveCount(0);

	// Attach comms-improver and fill its two required inputs (text + audience), so the chip is valid.
	await page.getByTestId('skill-attach').click();
	await page.getByTestId('skill-search').fill('comms');
	await expect(page.getByTestId('skill-result-comms-improver')).toBeVisible({ timeout: 10000 });
	await page.getByTestId('skill-result-comms-improver').click();
	await page.keyboard.press('Escape'); // close the search popover so it doesn't overlay the inputs
	await page.getByRole('textbox', { name: 'text' }).fill('pursuant to the foregoing provisions');
	await page.getByRole('textbox', { name: 'audience' }).fill('a 10-year-old');

	// Turn 2 — send with comms-improver attached → applied via the attach.
	await composer.fill('Please rewrite the text for the audience.');
	await composer.press('Enter');
	await expect(copyButtons).toHaveCount(2, TURN);
	await expect(appliedLinks).toHaveCount(1);

	// Turn 3 — toggle "Keep skills on" ON (comms still attached + inputs persist), send → snapshot.
	const toggle = page.getByTestId('sticky-toggle');
	await expect(toggle).toHaveAttribute('aria-checked', 'false');
	await toggle.click();
	await expect(toggle).toHaveAttribute('aria-checked', 'true');
	await composer.fill('Rewrite it again, even simpler.');
	await composer.press('Enter');
	await expect(copyButtons).toHaveCount(3, TURN);
	await expect(appliedLinks).toHaveCount(2);

	// Remove the attached chip so the next turn has NO per-turn skill — only the sticky set.
	await page.getByRole('button', { name: 'Remove Comms Improver' }).click();
	await expect(page.getByRole('button', { name: 'Remove Comms Improver' })).toHaveCount(0);

	// Turn 4 — send with no skill attached → STICKY carries comms-improver (the real proof).
	await composer.fill('What is a deposition, in plain language?');
	await composer.press('Enter');
	await expect(copyButtons).toHaveCount(4, TURN);
	await expect(appliedLinks).toHaveCount(3);

	// Turn 5 — toggle OFF and send → the sticky set is cleared, the turn applies no skill.
	await toggle.click();
	await expect(toggle).toHaveAttribute('aria-checked', 'false');
	await composer.fill('And what is an affidavit?');
	await composer.press('Enter');
	await expect(copyButtons).toHaveCount(5, TURN);
	await expect(appliedLinks).toHaveCount(3); // unchanged — turn 5 applied nothing
});
