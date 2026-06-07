import { describe, it, expect } from 'vitest';
import { createTabularBuilder } from './tabularBuilder.svelte';

describe('createTabularBuilder', () => {
	it('starts with no docs and one empty column; cannot run', () => {
		const b = createTabularBuilder();
		expect(b.docs).toEqual([]);
		expect(b.columns.length).toBe(1);
		expect(b.columns[0].name).toBe('');
		expect(b.cellCount).toBe(0);
		expect(b.canRun).toBe(false);
	});

	it('addDoc is idempotent by document_id and drives cellCount', () => {
		const b = createTabularBuilder();
		b.addDoc({ document_id: 'd1', name: 'a.pdf' });
		b.addDoc({ document_id: 'd1', name: 'a.pdf' });
		b.addDoc({ document_id: 'd2', name: 'b.pdf' });
		expect(b.docs.length).toBe(2);
		expect(b.hasDoc('d1')).toBe(true);
		b.setColumn(b.columns[0].id, { name: 'Term', query: 'How long?' });
		expect(b.cellCount).toBe(2);
		expect(b.canRun).toBe(true);
	});

	it('removeDoc removes by id', () => {
		const b = createTabularBuilder();
		b.addDoc({ document_id: 'd1', name: 'a.pdf' });
		b.removeDoc('d1');
		expect(b.docs).toEqual([]);
	});

	it('addColumn/removeColumn manage the column list (never below one)', () => {
		const b = createTabularBuilder();
		const first = b.columns[0].id;
		b.addColumn();
		expect(b.columns.length).toBe(2);
		b.removeColumn(first);
		expect(b.columns.length).toBe(1);
		b.removeColumn(b.columns[0].id);
		expect(b.columns.length).toBe(1); // floor of one
	});

	it('validColumns trims and drops incomplete rows; canRun needs a valid column + a doc', () => {
		const b = createTabularBuilder();
		b.addDoc({ document_id: 'd1', name: 'a.pdf' });
		b.setColumn(b.columns[0].id, { name: '  ', query: 'q' }); // blank name
		expect(b.validColumns()).toEqual([]);
		expect(b.canRun).toBe(false);
		b.setColumn(b.columns[0].id, { name: 'Term ', query: ' How long? ' });
		expect(b.validColumns()).toEqual([{ name: 'Term', query: 'How long?' }]);
		expect(b.canRun).toBe(true);
	});

	it('blocks canRun and flags duplicateNames when two valid columns share a name (case-insensitive)', () => {
		const b = createTabularBuilder();
		b.addDoc({ document_id: 'd1', name: 'a.pdf' });
		b.setColumn(b.columns[0].id, { name: 'Term', query: 'q1' });
		b.addColumn();
		b.setColumn(b.columns[1].id, { name: 'term', query: 'q2' });
		expect(b.duplicateNames).toBe(true);
		expect(b.canRun).toBe(false);
		b.setColumn(b.columns[1].id, { name: 'Governing law', query: 'q2' });
		expect(b.duplicateNames).toBe(false);
		expect(b.canRun).toBe(true);
	});

	it('defaults to ad-hoc mode and builds an ad-hoc request body', () => {
		const b = createTabularBuilder();
		expect(b.mode).toBe('adhoc');
		b.addDoc({ document_id: 'd1', name: 'a.pdf' });
		b.setColumn(b.columns[0].id, { name: 'Term', query: 'How long?' });
		expect(b.buildRequest()).toEqual({
			document_ids: ['d1'],
			columns: [{ name: 'Term', query: 'How long?' }]
		});
	});

	it('carries minimum_inference_tier into validColumns when set, omits it when null', () => {
		const b = createTabularBuilder();
		b.addDoc({ document_id: 'd1', name: 'a.pdf' });
		b.setColumn(b.columns[0].id, { name: 'Term', query: 'q', minimum_inference_tier: 4 });
		expect(b.validColumns()).toEqual([{ name: 'Term', query: 'q', minimum_inference_tier: 4 }]);
		b.setColumn(b.columns[0].id, { minimum_inference_tier: null });
		expect(b.validColumns()).toEqual([{ name: 'Term', query: 'q' }]);
	});

	it('includes ensemble_verification in validColumns only when toggled on', () => {
		const b = createTabularBuilder();
		b.addDoc({ document_id: 'd1', name: 'a.pdf' });
		b.setColumn(b.columns[0].id, { name: 'Term', query: 'q' });
		// off by default — ensemble_verification key must be absent
		expect(b.validColumns()[0]).not.toHaveProperty('ensemble_verification');
		// set true → key must be present and true
		b.setColumn(b.columns[0].id, { ensemble_verification: true });
		expect(b.validColumns()[0]).toMatchObject({
			name: 'Term',
			query: 'q',
			ensemble_verification: true
		});
		// set null → key must be absent again
		b.setColumn(b.columns[0].id, { ensemble_verification: null });
		expect(b.validColumns()[0]).not.toHaveProperty('ensemble_verification');
	});

	it('moveColumn swaps adjacent columns and is boundary-safe', () => {
		const b = createTabularBuilder();
		b.setColumn(b.columns[0].id, { name: 'A', query: 'qa' });
		b.addColumn();
		b.setColumn(b.columns[1].id, { name: 'B', query: 'qb' });
		const [a, bb] = [b.columns[0].id, b.columns[1].id];
		b.moveColumn(a, 1); // A down → [B, A]
		expect(b.columns.map((c) => c.name)).toEqual(['B', 'A']);
		b.moveColumn(a, 1); // A already last → no-op
		expect(b.columns.map((c) => c.name)).toEqual(['B', 'A']);
		b.moveColumn(bb, -1); // B already first → no-op
		expect(b.columns.map((c) => c.name)).toEqual(['B', 'A']);
	});

	it('skill mode needs a doc + a selected skill, and builds a skill request body', () => {
		const b = createTabularBuilder();
		b.setMode('skill');
		expect(b.mode).toBe('skill');
		expect(b.canRun).toBe(false); // no docs, no skill
		b.addDoc({ document_id: 'd1', name: 'a.pdf' });
		expect(b.canRun).toBe(false); // still no skill
		b.selectSkill({ name: 'contract-snapshot', title: 'Contract Snapshot' });
		expect(b.canRun).toBe(true);
		expect(b.buildRequest()).toEqual({ document_ids: ['d1'], skill_name: 'contract-snapshot' });
		b.clearSkill();
		expect(b.selectedSkill).toBeNull();
		expect(b.canRun).toBe(false);
	});
});
