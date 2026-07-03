// tests/audit-review.spec.ts
import { execSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { test, expect, type Page } from '@playwright/test';

// Cross-user auditor review (lq-ai #266). We SQL-seed a chat owned by a SECOND
// (foreign) user + an ai turn + a caselaw citation + a citation_ledger_entry +
// a fiduciary gate, then log in as the admin (a privileged reader) and assert
// /audit/chat/{id} renders the foreign user's receipt — proving the cross-user
// ledger read. Self-cleaning: the chat + foreign user are deleted in `finally`.

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

test("privileged reader reviews another user's chat ledger", async ({ page }) => {
	const adminId = sql(`SELECT id FROM users WHERE email='${EMAIL}' LIMIT 1`);
	test.skip(!adminId, 'no e2e admin in the dev DB');

	const foreignUserId = randomUUID();
	const foreignEmail = `e2e-foreign-${foreignUserId.slice(0, 8)}@example.test`;
	const chatId = randomUUID();
	const userMsgId = randomUUID();
	const asstMsgId = randomUUID();
	const caselawId = randomUUID();
	const QUOTE = 'noncompetition agreements are invalid even if narrowly drawn';

	try {
		// A foreign owner (never logs in) — id/email/hashed_password are the only required cols.
		sql(
			`INSERT INTO users (id, email, hashed_password, role) VALUES ('${foreignUserId}','${foreignEmail}','x','member')`
		);
		sql(
			`INSERT INTO chats (id, owner_id, title) VALUES ('${chatId}','${foreignUserId}','e2e-foreign chat')`
		);
		sql(
			`INSERT INTO messages (id, chat_id, role, content, kind) VALUES ('${userMsgId}','${chatId}','user','Is our non-compete enforceable','user')`
		);
		sql(
			`INSERT INTO messages (id, chat_id, role, content, kind) VALUES ('${asstMsgId}','${chatId}','assistant','Generally no under California law.','ai')`
		);
		sql(
			`INSERT INTO message_caselaw_citations (id, message_id, opinion_id, cluster_id, source_offset_start, source_offset_end, source_text, verified, verification_method)` +
				` VALUES ('${caselawId}','${asstMsgId}', 2812209, 654321, 0, ${QUOTE.length}, '${QUOTE}', true, 'exact_match')`
		);
		sql(
			`INSERT INTO citation_ledger_entry (chat_id, message_id, source_kind, message_caselaw_citation_id, verification_status, confidence, provider)` +
				` VALUES ('${chatId}','${asstMsgId}','caselaw','${caselawId}','exact_match', 1.0, 'courtlistener')`
		);
		sql(
			`INSERT INTO work_product_fiduciary_gate (message_id, chat_id, gate_status, pass_count, supported_count, fail_count, total_assertions, confidence)` +
				` VALUES ('${asstMsgId}','${chatId}','fiduciary_grade', 1, 0, 0, 1, 1.0)`
		);

		await login(page);

		// The Review nav entry is visible to the privileged admin.
		await expect(page.getByRole('link', { name: 'Review' })).toBeVisible();

		// Open the foreign chat's review — the gate pill + quoted passage render.
		await page.goto(`/audit/chat/${chatId}`);
		await expect(page.getByRole('button', { name: /fiduciary-grade/i }).first()).toBeVisible();
		await expect(page.getByText(new RegExp(QUOTE.slice(0, 24), 'i'))).toBeVisible();
	} finally {
		sql(`DELETE FROM chats WHERE id='${chatId}'`);
		sql(`DELETE FROM users WHERE id='${foreignUserId}'`);
	}
});
