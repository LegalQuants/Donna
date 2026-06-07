import { test, expect, type Page } from '@playwright/test';

const EMAIL = process.env.DONNA_E2E_EMAIL!;
const PASSWORD = process.env.DONNA_E2E_PASSWORD!;
const API = process.env.DONNA_LQ_AI_API ?? 'http://localhost:18000/api/v1';

async function token(): Promise<string> {
	return (
		await fetch(`${API}/auth/login`, {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ email: EMAIL, password: PASSWORD })
		}).then((r) => r.json())
	).access_token;
}

// --- Discovered via GET /api/v1/skills/comms-improver/inputs ---
// comms-improver declares two required text inputs: "text" and "audience".
// "document"-type skills were skipped because the SkillInputForm renders them as
// plain text inputs but the backend still expects file_ids; text-only inputs are
// the cleanest fixture for this test.
const SKILL_QUERY = 'comms';
const SKILL_RESULT_SLUG = 'comms-improver';
const INPUT_TEXT_NAME = 'text';
const INPUT_TEXT_VALUE =
	'The parties agree that all obligations hereunder shall be subject to confidentiality requirements as defined in Section 4.2 of the Master Agreement.';
const INPUT_AUDIENCE_NAME = 'audience';
const INPUT_AUDIENCE_VALUE = 'sales team';
// ---------------------------------------------------------------

async function login(page: Page) {
	await page.goto('/login');
	await page.fill('input[name="email"]', EMAIL);
	await page.fill('input[name="password"]', PASSWORD);
	await page.click('button:has-text("Sign in")');
	await page.waitForURL('/');
}

test('composer: attach a skill, fill its required inputs, send button gates correctly', async ({
	page
}) => {
	test.setTimeout(120_000);

	let chatId: string | null = null;
	const tok = await token();

	try {
		await login(page);

		// Fill the landing composer with a message.
		await page.getByPlaceholder(/ask a question/i).fill('Please improve the following legal text.');

		// Open the skill picker and attach comms-improver.
		await page.getByTestId('skill-attach').click();
		await page.getByTestId('skill-search').fill(SKILL_QUERY);
		await expect(page.getByTestId(`skill-result-${SKILL_RESULT_SLUG}`)).toBeVisible({
			timeout: 10_000
		});
		await page.getByTestId(`skill-result-${SKILL_RESULT_SLUG}`).click();

		// The SkillInputForm should be visible — comms-improver has two required inputs.
		const textInput = page.getByLabel(INPUT_TEXT_NAME);
		const audienceInput = page.getByLabel(INPUT_AUDIENCE_NAME);
		await expect(textInput).toBeVisible({ timeout: 10_000 });
		await expect(audienceInput).toBeVisible({ timeout: 10_000 });

		const send = page.getByRole('button', { name: 'Send', exact: true });

		// Send must be disabled while required inputs are unfilled.
		await expect(send).toBeDisabled();

		// Fill the first required input — still disabled (second still empty).
		await textInput.fill(INPUT_TEXT_VALUE);
		await expect(send).toBeDisabled();

		// Fill the second required input — now both are provided, Send must enable.
		await audienceInput.fill(INPUT_AUDIENCE_VALUE);
		await expect(send).toBeEnabled();

		// Intercept the POST to assert skill_inputs are threaded through.
		const reqPromise = page.waitForRequest(
			(req) => req.url().includes('/messages') && req.method() === 'POST'
		);

		await send.click();

		// Should redirect to the new chat URL.
		await page.waitForURL(/\/chats\/[0-9a-f-]+/i, { timeout: 15_000 });

		// Capture chat id for cleanup
		const match = page.url().match(/\/chats\/([0-9a-f-]+)/i);
		chatId = match ? match[1] : null;

		// Assert the POST body carried skill_inputs.
		const req = await reqPromise;
		const body = JSON.parse(req.postData() ?? '{}') as {
			skills?: string[];
			skill_inputs?: Record<string, Record<string, unknown>>;
		};
		expect(body.skills).toContain(SKILL_RESULT_SLUG);
		expect(body.skill_inputs).toBeDefined();
		expect(body.skill_inputs![SKILL_RESULT_SLUG]).toMatchObject({
			[INPUT_TEXT_NAME]: INPUT_TEXT_VALUE,
			[INPUT_AUDIENCE_NAME]: INPUT_AUDIENCE_VALUE
		});

		// The assistant reply streams in.
		await expect(page.locator('.prose-mlq').last()).toContainText(/\w/, { timeout: 60_000 });
	} finally {
		// Cleanup: delete the created chat via the lq-ai API
		if (chatId) {
			await fetch(`${API}/chats/${chatId}`, {
				method: 'DELETE',
				headers: { authorization: `Bearer ${tok}` }
			}).catch(() => {});
		}
	}
});
