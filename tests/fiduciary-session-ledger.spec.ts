import { execSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { test, expect, type Page } from '@playwright/test';

// Live e2e for the autonomous-session fiduciary receipt (Slice 3). The session
// ledger endpoint (GET /autonomous/sessions/{id}/ledger) resolves the hidden
// backing chat by chats.autonomous_session_id, then reuses resolve_ledger_entries
// + resolve_gates (the same functions the chat ledger uses) — so we SQL-seed a
// completed session + its hidden chat + an assistant turn + a caselaw citation +
// a citation_ledger_entry + a fiduciary gate, then assert the session gate pill +
// the reused FiduciaryReceipt block render on /automations/[id]. Self-cleaning:
// the chat delete cascades to messages/citations/ledger/gate; the session is
// deleted explicitly.

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

test('autonomous session view: gate pill + fiduciary receipt from seeded ledger', async ({
	page
}) => {
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
		// The hidden backing chat, linked to the session — the endpoint finds it via
		// chats.autonomous_session_id (migration 0063).
		sql(
			`INSERT INTO chats (id, owner_id, title, autonomous_session_id) VALUES ('${chatId}','${ownerId}','e2e-session-ledger chat','${sessionId}')`
		);
		sql(
			`INSERT INTO messages (id, chat_id, role, content, kind) VALUES ('${asstMsgId}','${chatId}','assistant','Under California law the non-compete is unenforceable.','ai')`
		);
		// A caselaw citation (cleanest quoted source — no file FK needed).
		sql(
			`INSERT INTO message_caselaw_citations (id, message_id, opinion_id, cluster_id, source_offset_start, source_offset_end, source_text, verified, verification_method)` +
				` VALUES ('${caselawId}','${asstMsgId}',100,200,0,${QUOTE.length},'${QUOTE}',true,'exact_match')`
		);
		// citation_ledger_entry needs exactly ONE source FK — the caselaw citation id.
		sql(
			`INSERT INTO citation_ledger_entry (chat_id, message_id, source_kind, message_caselaw_citation_id, verification_status, confidence, provider)` +
				` VALUES ('${chatId}','${asstMsgId}','caselaw','${caselawId}','exact_match',0.98,'courtlistener')`
		);
		// The single fiduciary gate resolve_gates(chat_id) reads → the "Fiduciary-grade" pill.
		sql(
			`INSERT INTO work_product_fiduciary_gate (message_id, chat_id, gate_status, pass_count, supported_count, fail_count, total_assertions, confidence)` +
				` VALUES ('${asstMsgId}','${chatId}','fiduciary_grade',1,0,0,1,0.98)`
		);

		await login(page);
		await page.goto(`/automations/${sessionId}`);

		// The reused fiduciary receipt block renders with the seeded caselaw quote.
		await expect(page.getByText('Fiduciary receipt')).toBeVisible();
		await expect(page.getByText(new RegExp(QUOTE))).toBeVisible();

		// The session gate trust pill renders in the header (deterministic from the
		// seeded fiduciary_grade gate with a non-zero assertion count).
		await expect(page.getByText('Fiduciary-grade').first()).toBeVisible();
	} finally {
		sql(`DELETE FROM chats WHERE id='${chatId}'`);
		sql(`DELETE FROM autonomous_sessions WHERE id='${sessionId}'`);
	}
});
