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

async function deleteOwned(page: Page, id: string) {
	await page.goto(`/playbooks/${id}`);
	const del = page.getByRole('button', { name: /^delete/i });
	if (await del.count()) {
		await del.click();
		await page
			.getByRole('dialog')
			.getByRole('button', { name: /^delete/i })
			.click();
		await page.waitForURL(/\/playbooks$/);
	}
}

test('duplicate a built-in, edit it, create from scratch, delete', async ({ page }) => {
	test.setTimeout(90_000);
	const created: string[] = [];
	const stamp = Date.now();

	try {
		await login(page);

		// 1. Duplicate the first built-in from its detail page.
		await page.goto('/playbooks');
		await page.locator('ul a[href^="/playbooks/"]').first().click();
		await expect(page).toHaveURL(/\/playbooks\/[0-9a-f-]+$/i);
		await page.getByRole('link', { name: /duplicate/i }).click();
		await expect(page).toHaveURL(/\/playbooks\/new\/manual\?from=/);
		await expect(page.getByLabel(/playbook name/i)).toHaveValue(/^Copy of /);
		const dupName = `Authoring E2E Dup ${stamp}`;
		await page.getByLabel(/playbook name/i).fill(dupName);
		await page.getByRole('button', { name: /save playbook/i }).click();
		await expect(page).toHaveURL(/\/playbooks\/[0-9a-f-]+$/i);
		created.push(page.url().split('/').pop()!);
		await expect(page.getByRole('heading', { level: 1, name: dupName })).toBeVisible();

		// 2. Edit it: rename, add a position, reorder, save.
		await page.getByRole('link', { name: /^edit/i }).click();
		await expect(page).toHaveURL(/\/edit$/);
		const editedName = `${dupName} v2`;
		await page.getByLabel(/playbook name/i).fill(editedName);
		await page.getByRole('button', { name: /add position/i }).click();
		// The new (last) position is auto-expanded — fill its required fields.
		await page
			.getByLabel(/^issue/i)
			.last()
			.fill('E2E Added Position');
		await page
			.getByLabel(/standard language/i)
			.last()
			.fill('Added standard language.');
		await page.getByRole('button', { name: /move E2E Added Position up/i }).click();
		await page.getByRole('button', { name: /save changes/i }).click();
		await expect(page).toHaveURL(/\/playbooks\/[0-9a-f-]+$/i);
		await expect(page.getByRole('heading', { level: 1, name: editedName })).toBeVisible();
		await expect(page.getByText('E2E Added Position')).toBeVisible();

		// 3. Create from scratch via the chooser.
		await page.goto('/playbooks');
		await page.getByRole('button', { name: /new playbook/i }).click();
		await page.getByRole('link', { name: /start from scratch/i }).click();
		await expect(page).toHaveURL(/\/playbooks\/new\/manual$/);
		const scratchName = `Authoring E2E Scratch ${stamp}`;
		await page.getByLabel(/playbook name/i).fill(scratchName);
		await page.getByLabel(/contract type/i).fill('NDA');
		await page
			.getByLabel(/^issue/i)
			.first()
			.fill('Scratch Position');
		await page
			.getByLabel(/standard language/i)
			.first()
			.fill('Scratch language.');
		await page.getByRole('button', { name: /save playbook/i }).click();
		await expect(page).toHaveURL(/\/playbooks\/[0-9a-f-]+$/i);
		created.push(page.url().split('/').pop()!);

		// 4. Delete the scratch playbook via the confirm modal.
		await page.getByRole('button', { name: /^delete/i }).click();
		await page
			.getByRole('dialog')
			.getByRole('button', { name: /^delete/i })
			.click();
		await expect(page).toHaveURL(/\/playbooks$/);
		created.pop(); // deleted above
	} finally {
		for (const id of created) await deleteOwned(page, id);
	}
});
