import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import { fireEvent } from '@testing-library/dom';
import CellDetail from './CellDetail.svelte';
import type { TabularCell } from './types';

const cell: TabularCell = {
	value: 'Delaware',
	confidence: 'high',
	error: null,
	cited_chunk_ids: ['c1'],
	citations: [{ source_file_id: 'file-1', source_page: 4, source_text: 'governed by Delaware law' }]
};

describe('CellDetail citations', () => {
	it('calls onactivatecitation with the citation when a source is clicked', async () => {
		const onactivatecitation = vi.fn();
		render(CellDetail, {
			props: { column: 'Governing law', cell, onclose: () => {}, onactivatecitation } as never
		});
		await fireEvent.click(screen.getByRole('button', { name: /open source, page 4/i }));
		expect(onactivatecitation).toHaveBeenCalledWith(cell.citations[0]);
	});
});
