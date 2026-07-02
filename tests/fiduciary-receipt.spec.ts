import { execSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { test, expect, type Page } from '@playwright/test';

// Live e2e for the per-turn fiduciary receipt (Slice 1). The ledger is
// model-discretionary, so we SQL-seed a chat + assistant turn + a caselaw
// citation + a citation_ledger_entry + a fiduciary gate (house pattern from
// automations-artifacts.spec.ts), then assert the trust pill + expandable
// receipt panel render end-to-end. Self-cleaning: the chat is deleted in
// `finally` (FKs cascade to messages/citations/ledger/gate).

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

test('per-turn fiduciary receipt: trust pill + ledger panel from seeded data', async ({ page }) => {
	const ownerId = sql(`SELECT id FROM users WHERE email='${EMAIL}' LIMIT 1`);
	test.skip(!ownerId, 'no e2e user in the dev DB');

	const chatId = randomUUID();
	const userMsgId = randomUUID();
	const asstMsgId = randomUUID();
	const caselawId = randomUUID();
	const QUOTE = 'noncompetition agreements are invalid even if narrowly drawn';

	try {
		sql(
			`INSERT INTO chats (id, owner_id, title) VALUES ('${chatId}','${ownerId}','e2e-fiduciary chat')`
		);
		sql(
			`INSERT INTO messages (id, chat_id, role, content, kind) VALUES ('${userMsgId}','${chatId}','user','Is our non-compete enforceable in California','user')`
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
		await page.goto(`/chats/${chatId}`);

		// The trust pill is always-visible on the gated assistant turn (a button).
		const pill = page.getByRole('button', { name: /fiduciary-grade/i });
		await expect(pill).toBeVisible();

		// The quoted passage is inside the collapsed panel — not shown until expand.
		const quote = page.getByText(new RegExp(QUOTE.slice(0, 24), 'i'));
		await expect(quote).toHaveCount(0);

		await pill.click();
		await expect(quote).toBeVisible();
	} finally {
		sql(`DELETE FROM chats WHERE id='${chatId}'`);
	}
});

// Slice 2: seed a derived treatment (citation_treatment + a signal) linked to the
// caselaw entry via citation_ledger_entry.treatment_id, and assert the muted
// "⚖ Cited by N" treatment line + the click-through opening the opinion doc panel.
// citation_treatment is NOT cascade-deleted by the chat (it keys on cluster_id), so
// it is torn down explicitly.
test('caselaw entry: derived treatment line + click-through opens the opinion', async ({
	page
}) => {
	const ownerId = sql(`SELECT id FROM users WHERE email='${EMAIL}' LIMIT 1`);
	test.skip(!ownerId, 'no e2e user in the dev DB');

	const chatId = randomUUID();
	const userMsgId = randomUUID();
	const asstMsgId = randomUUID();
	const caselawId = randomUUID();
	const treatmentId = randomUUID();
	const clusterId = 900000000 + Math.floor(Math.random() * 90000000);
	const opinionId = 2812209;
	const QUOTE = 'the later panel expressly overruled the cited holding';

	try {
		sql(
			`INSERT INTO chats (id, owner_id, title) VALUES ('${chatId}','${ownerId}','e2e-fiduciary treatment')`
		);
		sql(
			`INSERT INTO messages (id, chat_id, role, content, kind) VALUES ('${userMsgId}','${chatId}','user','Is this case still good law','user')`
		);
		sql(
			`INSERT INTO messages (id, chat_id, role, content, kind) VALUES ('${asstMsgId}','${chatId}','assistant','It has negative treatment.','ai')`
		);
		sql(
			`INSERT INTO message_caselaw_citations (id, message_id, opinion_id, cluster_id, source_offset_start, source_offset_end, source_text, verified, verification_method)` +
				` VALUES ('${caselawId}','${asstMsgId}', ${opinionId}, ${clusterId}, 0, ${QUOTE.length}, '${QUOTE}', true, 'exact_match')`
		);
		sql(
			`INSERT INTO citation_treatment (id, cluster_id, opinion_id, cited_by_count, citing_opinions, derived_method, strongest_negative_class, judged_count, judge_as_of)` +
				` VALUES ('${treatmentId}', ${clusterId}, ${opinionId}, 214, '[]'::jsonb, 'citation_graph+judge', 'overruled', 6, now())`
		);
		sql(
			`INSERT INTO citation_treatment_signal (treatment_id, citing_opinion_id, classification, confidence, justification)` +
				` VALUES ('${treatmentId}', 998877, 'overruled', 0.85, 'The later panel expressly overrules the cited holding.')`
		);
		sql(
			`INSERT INTO citation_ledger_entry (chat_id, message_id, source_kind, message_caselaw_citation_id, verification_status, confidence, provider, treatment_id)` +
				` VALUES ('${chatId}','${asstMsgId}','caselaw','${caselawId}','exact_match', 1.0, 'courtlistener', '${treatmentId}')`
		);
		sql(
			`INSERT INTO work_product_fiduciary_gate (message_id, chat_id, gate_status, pass_count, supported_count, fail_count, total_assertions, confidence)` +
				` VALUES ('${asstMsgId}','${chatId}','fiduciary_grade', 1, 0, 0, 1, 1.0)`
		);

		await login(page);
		await page.goto(`/chats/${chatId}`);
		await page.getByRole('button', { name: /fiduciary-grade/i }).click();

		// Muted derived-treatment line + the strongest signal (never good/bad-colored).
		await expect(page.getByText(/cited by 214/i)).toBeVisible();
		await expect(page.getByText(/overruled/i).first()).toBeVisible();

		// Click-through: the caselaw source title is a button; clicking opens the doc panel.
		const sourceBtn = page.getByRole('button', { name: /Opinion #2812209/i });
		await expect(sourceBtn).toBeVisible();
		await sourceBtn.click();
		await expect(page.locator('[aria-label="Document panel"]')).toBeVisible();
	} finally {
		sql(`DELETE FROM chats WHERE id='${chatId}'`);
		sql(`DELETE FROM citation_treatment WHERE id='${treatmentId}'`);
	}
});
