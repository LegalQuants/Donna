import { execSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { test, expect, type Page } from '@playwright/test';

// Live e2e for Slice 4 provenance export: seed a session ledger (as Slice 3),
// open the Export menu on /automations/[id], download the JSON provenance
// record via Playwright's download event, and assert its content carries the
// disclaimer + the seeded session_id. Self-cleaning.

function sql(q: string): string {
	return execSync(
		`docker compose exec -T postgres psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -At -c "${q.replaceAll('"', '\\"')}"`,
		{ encoding: 'utf-8', env: process.env }
	).trim();
}

const EMAIL = process.env.DONNA_E2E_EMAIL ?? 'admin@lq.ai';
const PASSWORD = process.env.DONNA_E2E_PASSWORD!;
const DISCLAIMER =
	'A faithful copy of the sourcing trail — not a cryptographically signed attestation.';

async function login(page: Page) {
	await page.goto('/login');
	await page.fill('input[name="email"]', EMAIL);
	await page.fill('input[name="password"]', PASSWORD);
	await page.click('button:has-text("Sign in")');
	await page.waitForURL('/');
}

test('exports a JSON provenance record from the autonomous session receipt', async ({ page }) => {
	const ownerId = sql(`SELECT id FROM users WHERE email='${EMAIL}' LIMIT 1`);
	test.skip(!ownerId, 'no e2e user in the dev DB');

	const sessionId = randomUUID();
	const chatId = randomUUID();
	const asstMsgId = randomUUID();
	const caselawId = randomUUID();
	const QUOTE = 'noncompetition agreements are invalid even if narrowly drawn';

	try {
		sql(
			`INSERT INTO autonomous_sessions (id, user_id, trigger_kind, current_phase, status, cost_total_usd, max_cost_usd, completed_at)` +
				` VALUES ('${sessionId}','${ownerId}','manual','delivery','completed',0.12,2.00, now())`
		);
		sql(
			`INSERT INTO chats (id, owner_id, title, autonomous_session_id) VALUES ('${chatId}','${ownerId}','e2e-export chat','${sessionId}')`
		);
		sql(
			`INSERT INTO messages (id, chat_id, role, content, kind) VALUES ('${asstMsgId}','${chatId}','assistant','Under California law the non-compete is unenforceable.','ai')`
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
		await page.goto(`/automations/${sessionId}`);

		await expect(page.getByText('Fiduciary receipt')).toBeVisible();
		await page.getByRole('button', { name: /export/i }).click();

		const [download] = await Promise.all([
			page.waitForEvent('download'),
			page.getByRole('button', { name: 'Provenance record (.json)' }).click()
		]);
		expect(download.suggestedFilename()).toMatch(/^provenance-session-.+\.json$/);
		const path = await download.path();
		const content = readFileSync(path, 'utf-8');
		expect(content).toContain(DISCLAIMER);
		expect(content).toContain(sessionId);
	} finally {
		sql(`DELETE FROM chats WHERE id='${chatId}'`);
		sql(`DELETE FROM autonomous_sessions WHERE id='${sessionId}'`);
	}
});
