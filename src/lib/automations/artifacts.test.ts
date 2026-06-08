import { describe, it, expect } from 'vitest';
import { parseArtifactList } from './artifacts';

const raw = (over: Record<string, unknown> = {}) => ({
	id: 'a1',
	name: 'DPA review memo.md',
	mime: 'text/markdown',
	size_bytes: 4608,
	file_id: 'f1',
	document_id: 'd1',
	created_at: '2026-06-07T10:00:00Z',
	...over
});

describe('parseArtifactList', () => {
	it('parses the artifacts envelope with total_count', () => {
		const out = parseArtifactList({ artifacts: [raw()], total_count: 7 });
		expect(out.artifacts).toEqual([
			{
				id: 'a1',
				name: 'DPA review memo.md',
				mime: 'text/markdown',
				size_bytes: 4608,
				file_id: 'f1',
				document_id: 'd1',
				created_at: '2026-06-07T10:00:00Z'
			}
		]);
		expect(out.total).toBe(7);
	});
	it('normalizes missing nullable refs to null (hard-deleted file)', () => {
		const out = parseArtifactList({
			artifacts: [raw({ file_id: null, document_id: undefined })],
			total_count: 1
		});
		expect(out.artifacts[0].file_id).toBeNull();
		expect(out.artifacts[0].document_id).toBeNull();
	});
	it('drops rows without a string id and falls back total to length', () => {
		const out = parseArtifactList({ artifacts: [raw(), { name: 'no id' }] });
		expect(out.artifacts).toHaveLength(1);
		expect(out.total).toBe(1);
	});
	it('tolerates garbage input', () => {
		expect(parseArtifactList(null)).toEqual({ artifacts: [], total: 0 });
		expect(parseArtifactList('nope')).toEqual({ artifacts: [], total: 0 });
		expect(parseArtifactList({ artifacts: 'nope' })).toEqual({ artifacts: [], total: 0 });
	});
	it('coerces a non-numeric size to 0 (defensive)', () => {
		const out = parseArtifactList({ artifacts: [raw({ size_bytes: 'big' })], total_count: 1 });
		expect(out.artifacts[0].size_bytes).toBe(0);
	});
});
