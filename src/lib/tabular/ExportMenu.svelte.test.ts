import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';
import ExportMenu from './ExportMenu.svelte';

describe('ExportMenu', () => {
	it('exposes xlsx and csv export links for the execution', async () => {
		render(ExportMenu, { props: { executionId: 'ex1' } as never });
		await fireEvent.click(screen.getByRole('button', { name: /export/i }));
		const xlsx = screen.getByRole('link', { name: /excel/i });
		const csv = screen.getByRole('link', { name: /csv/i });
		expect(xlsx).toHaveAttribute('href', '/tabular-executions/ex1/export?format=xlsx');
		expect(csv).toHaveAttribute('href', '/tabular-executions/ex1/export?format=csv');
	});
});
