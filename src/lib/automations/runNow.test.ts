// src/lib/automations/runNow.test.ts
import { describe, it, expect } from 'vitest';
import { toPlaybookItems, toSkillItems } from './runNow';

describe('toPlaybookItems', () => {
	it('maps playbooks to {value:id,label:name,sub:contract_type}', () => {
		const items = toPlaybookItems([{ id: 'p1', name: 'NDA — Mutual', contract_type: 'NDA' }]);
		expect(items).toEqual([{ value: 'p1', label: 'NDA — Mutual', sub: 'NDA' }]);
	});
	it('returns [] for a non-array', () => {
		expect(toPlaybookItems(null as never)).toEqual([]);
	});
});

describe('toSkillItems', () => {
	it('merges user skills (slug) and built-ins (name) into source items', () => {
		const items = toSkillItems(
			[{ slug: 'my-skill', display_name: 'My Skill', description: 'mine' }],
			[{ name: 'comms-improver', title: 'Comms Improver', description: 'builtin' }]
		);
		expect(items).toEqual([
			{ value: 'my-skill', label: 'My Skill', sub: 'mine' },
			{ value: 'comms-improver', label: 'Comms Improver', sub: 'builtin' }
		]);
	});
	it('tolerates missing arrays', () => {
		expect(toSkillItems(undefined as never, undefined as never)).toEqual([]);
	});
	it('drops a built-in whose name collides with a user-skill slug (user wins)', () => {
		const items = toSkillItems(
			[{ slug: 'contract-qa', display_name: 'My Contract QA', description: 'mine' }],
			[{ name: 'contract-qa', title: 'Built-in Contract QA', description: 'builtin' }]
		);
		expect(items).toEqual([{ value: 'contract-qa', label: 'My Contract QA', sub: 'mine' }]);
	});
	it('dedupes user skills sharing a slug so SourcePicker keys stay unique', () => {
		const items = toSkillItems(
			[
				{ slug: 'generated-nda', display_name: 'Generated NDA', description: 'v1' },
				{ slug: 'generated-nda', display_name: 'Generated NDA', description: 'v2' }
			],
			[{ name: 'comms', title: 'Comms', description: 'builtin' }]
		);
		expect(items.map((i) => i.value)).toEqual(['generated-nda', 'comms']);
		expect(new Set(items.map((i) => i.value)).size).toBe(items.length); // no duplicate keys
	});
});

describe('toPlaybookItems dedupe', () => {
	it('dedupes playbooks sharing an id', () => {
		const items = toPlaybookItems([
			{ id: 'p1', name: 'NDA', contract_type: 'NDA' },
			{ id: 'p1', name: 'NDA copy', contract_type: 'NDA' }
		]);
		expect(items).toEqual([{ value: 'p1', label: 'NDA', sub: 'NDA' }]);
	});
});
