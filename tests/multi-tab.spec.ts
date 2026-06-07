import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';

const EMAIL = process.env.DONNA_E2E_EMAIL!;
const PASSWORD = process.env.DONNA_E2E_PASSWORD!;
const API = process.env.DONNA_LQ_AI_API ?? 'http://localhost:18000/api/v1';
const PDF_A = process.env.DONNA_SPIKE_PDF ?? '/tmp/spike.pdf';
const PDF_B = process.env.DONNA_SPIKE_PDF2 ?? '/tmp/spike2.pdf';

async function api(token: string, path: string, init: RequestInit = {}) {
	return fetch(`${API}${path}`, {
		...init,
		headers: { authorization: `Bearer ${token}`, ...(init.headers || {}) }
	});
}
const j = (token: string, path: string, init?: RequestInit) =>
	api(token, path, init).then((r) => r.json());

async function uploadAndIngest(token: string, name: string, path: string): Promise<string> {
	const fd = new FormData();
	fd.append('file', new Blob([readFileSync(path)], { type: 'application/pdf' }), name);
	const fid = (await api(token, '/files', { method: 'POST', body: fd }).then((r) => r.json())).id;
	for (let i = 0; i < 60; i++) {
		const st = (await j(token, `/files/${fid}`)).ingestion_status;
		if (st === 'ready') break;
		if (st === 'failed') throw new Error(`ingestion failed for ${name}`);
		if (i === 59) throw new Error(`ingestion timed out for ${name}`);
		await new Promise((r) => setTimeout(r, 2000));
	}
	return fid;
}

async function seedTwoFileChat(): Promise<string> {
	const tok = (
		await j('', '/auth/login', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ email: EMAIL, password: PASSWORD })
		})
	).access_token;

	const pid = (
		await j(tok, '/projects', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ name: 'E2E Multi-tab Matter' })
		})
	).id;
	const kid = (
		await j(tok, '/knowledge-bases', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ name: 'E2E Multi-tab KB' })
		})
	).id;
	await api(tok, `/projects/${pid}/knowledge-bases`, {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({ knowledge_base_id: kid })
	});

	const fidA = await uploadAndIngest(tok, 'msa.pdf', PDF_A);
	const fidB = await uploadAndIngest(tok, 'nda.pdf', PDF_B);
	await api(tok, `/knowledge-bases/${kid}/files`, {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({ file_id: fidA })
	});
	await api(tok, `/knowledge-bases/${kid}/files`, {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({ file_id: fidB })
	});

	// Wait until both topics retrieve (embeddings settled for both files).
	for (let i = 0; i < 60; i++) {
		const a =
			(
				await j(tok, `/knowledge-bases/${kid}/query`, {
					method: 'POST',
					headers: { 'content-type': 'application/json' },
					body: JSON.stringify({ query: 'termination for convenience notice', top_k: 3 })
				})
			).results ?? [];
		const b =
			(
				await j(tok, `/knowledge-bases/${kid}/query`, {
					method: 'POST',
					headers: { 'content-type': 'application/json' },
					body: JSON.stringify({ query: 'limitation of liability cap', top_k: 3 })
				})
			).results ?? [];
		if (a.length && b.length) break;
		await new Promise((r) => setTimeout(r, 2000));
	}

	const cid = (
		await j(tok, '/chats', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ title: 'E2E multi-tab chat', project_id: pid })
		})
	).id;
	const q =
		'Summarize this contract set: state the termination-for-convenience notice period AND the limitation-of-liability cap. Quote the operative clause for each.';
	const msg = await j(tok, `/chats/${cid}/messages`, {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({ content: q, model: 'smart', stream: false })
	});
	const mid = msg.id ?? msg.message?.id;
	const cites = await j(tok, `/chats/${cid}/messages/${mid}/citations`);
	const distinct = new Set(
		(Array.isArray(cites) ? cites : (cites.citations ?? [])).map(
			(c: { source_file_id: string }) => c.source_file_id
		)
	);
	if (distinct.size < 2)
		throw new Error(
			`seed produced ${distinct.size} distinct cited files; need 2 (model variance — re-run)`
		);
	return cid;
}

async function login(page: Page) {
	await page.goto('/login');
	await page.fill('input[name="email"]', EMAIL);
	await page.fill('input[name="password"]', PASSWORD);
	await page.click('button:has-text("Sign in")');
	await page.waitForURL('/');
}

const highlightSize = (page: Page) =>
	page.evaluate(
		() => (globalThis.CSS?.highlights?.get('cite') as { size?: number } | undefined)?.size ?? 0
	);

test('opening two distinct cited files yields two tabs; the highlight tracks the active tab', async ({
	page
}) => {
	test.setTimeout(240_000);
	const cid = await seedTwoFileChat();
	await login(page);
	await page.goto(`/chats/${cid}`);
	await page.waitForLoadState('networkidle');

	const pills = page.locator('.cite-tab');
	await expect(pills.nth(1)).toBeVisible({ timeout: 20000 }); // at least 2 pills

	const panel = page.getByRole('complementary', { name: /document panel/i });
	const closeTabs = panel.getByRole('button', { name: /^Close (?!document panel).+/ });

	// Open the first pill → panel opens with one tab and a highlight.
	await pills.nth(0).click();
	await expect(panel).toBeVisible({ timeout: 15000 });
	await expect.poll(() => highlightSize(page), { timeout: 15000 }).toBeGreaterThan(0);

	// Click subsequent pills until a second distinct-file tab opens.
	// (Both citations may come from the same file; walk pills until count reaches 2.)
	const pillCount = await pills.count();
	// Walk pills until a SECOND distinct tab opens (some citations may reuse a file).
	for (let i = 1; i < pillCount; i++) {
		await pills.nth(i).click();
		try {
			await expect(closeTabs).toHaveCount(2, { timeout: 8000 });
			break;
		} catch {
			// this pill cited an already-open file (dedupe) — try the next pill
		}
	}
	await expect(closeTabs).toHaveCount(2, { timeout: 15000 });
	await expect.poll(() => highlightSize(page), { timeout: 15000 }).toBeGreaterThan(0);

	// Read the two tab filenames now that both are open.
	const tabNames = await closeTabs.evaluateAll((btns) =>
		btns.map((b) => b.getAttribute('aria-label')?.replace(/^Close /, '') ?? '')
	);
	const [firstTab, secondTab] = tabNames; // e.g. ['msa.pdf', 'nda.pdf']

	// Switch back to the first tab → highlight re-registers for that doc.
	await panel.getByRole('button', { name: firstTab, exact: true }).click();
	await expect.poll(() => highlightSize(page), { timeout: 15000 }).toBeGreaterThan(0);

	// Close the second tab → one tab remains.
	await panel.getByRole('button', { name: `Close ${secondTab}` }).click();
	await expect(closeTabs).toHaveCount(1, { timeout: 15000 });
});
