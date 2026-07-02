import { execSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { test, expect, type Page } from '@playwright/test';

function sql(q: string): string {
	return execSync(
		`docker compose exec -T postgres psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -At -c "${q.replaceAll('"', '\\"')}"`,
		{ encoding: 'utf-8', env: process.env }
	).trim();
}

const EMAIL = process.env.DONNA_E2E_EMAIL ?? 'admin@lq.ai';
const PASSWORD = process.env.DONNA_E2E_PASSWORD!;

async function login(page: Page) {
	await page.goto('/login');
	await page.fill('input[name="email"]', EMAIL);
	await page.fill('input[name="password"]', PASSWORD);
	await page.click('button:has-text("Sign in")');
	await page.waitForURL('/');
}

test('research authoritative-sources hint dismisses and stays dismissed across a reload', async ({
	page
}) => {
	await login(page);
	await page.goto('/research');

	const hint = page.getByRole('note').filter({ hasText: 'Authoritative sources card below' });
	await expect(hint).toBeVisible();
	await hint.getByRole('button', { name: 'Dismiss hint' }).click();
	await expect(hint).toHaveCount(0);

	// Persisted: reload → still gone.
	await page.reload();
	await expect(page.getByText('Authoritative sources card below')).toHaveCount(0);
});

test('trust-pill hint shows once a chat has a fiduciary receipt, then dismisses', async ({
	page
}) => {
	const ownerId = sql(`SELECT id FROM users WHERE email='${EMAIL}' LIMIT 1`);
	test.skip(!ownerId, 'no e2e user in the dev DB');

	const chatId = randomUUID();
	const asstMsgId = randomUUID();
	const caselawId = randomUUID();
	const QUOTE = 'noncompetition agreements are invalid even if narrowly drawn';

	try {
		sql(
			`INSERT INTO chats (id, owner_id, title) VALUES ('${chatId}','${ownerId}','e2e-hint chat')`
		);
		sql(
			`INSERT INTO messages (id, chat_id, role, content, kind) VALUES ('${asstMsgId}','${chatId}','assistant','Generally no under California law.','ai')`
		);
		sql(
			`INSERT INTO message_caselaw_citations (id, message_id, opinion_id, cluster_id, source_offset_start, source_offset_end, source_text, verified, verification_method)` +
				` VALUES ('${caselawId}','${asstMsgId}',100,200,0,${QUOTE.length},'${QUOTE}',true,'exact_match')`
		);
		sql(
			`INSERT INTO citation_ledger_entry (chat_id, message_id, source_kind, message_caselaw_citation_id, verification_status, confidence, provider)` +
				` VALUES ('${chatId}','${asstMsgId}','caselaw','${caselawId}','exact_match',0.98,'courtlistener')`
		);
		sql(
			`INSERT INTO work_product_fiduciary_gate (message_id, chat_id, gate_status, pass_count, supported_count, fail_count, total_assertions, confidence)` +
				` VALUES ('${asstMsgId}','${chatId}','fiduciary_grade',1,0,0,1,0.98)`
		);

		await login(page);
		await page.goto(`/chats/${chatId}`);

		const hint = page.getByRole('note').filter({ hasText: 'every answer now carries a' });
		await expect(hint).toBeVisible();
		await hint.getByRole('button', { name: 'Dismiss hint' }).click();
		await expect(hint).toHaveCount(0);
	} finally {
		sql(`DELETE FROM chats WHERE id='${chatId}'`);
	}
});
