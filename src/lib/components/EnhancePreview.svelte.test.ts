/// <reference types="@testing-library/jest-dom/vitest" />
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import EnhancePreview from './EnhancePreview.svelte';
import type { EnhancePromptResponse } from '$lib/enhance/types';

const result: EnhancePromptResponse = {
	interaction_id: 'i1',
	expansion_applied: true,
	expanded_prompt: 'You are in-house counsel reviewing an NDA…',
	reasoning: ['Added role', 'Added scope']
};

describe('EnhancePreview', () => {
	it('shows the expanded prompt and toggles the reasoning list', async () => {
		const { getByTestId, getByText, queryByText } = render(EnhancePreview, {
			props: { result, onaccept: vi.fn(), ondiscard: vi.fn() }
		});
		expect(getByTestId('enhance-expanded')).toHaveTextContent('in-house counsel');
		expect(queryByText('Added role')).toBeNull();
		await userEvent.click(getByText(/why these changes/i));
		expect(getByText('Added role')).toBeInTheDocument();
	});

	it('fires accept and discard', async () => {
		const onaccept = vi.fn();
		const ondiscard = vi.fn();
		const { getByTestId } = render(EnhancePreview, { props: { result, onaccept, ondiscard } });
		await userEvent.click(getByTestId('enhance-accept'));
		expect(onaccept).toHaveBeenCalledTimes(1);
		await userEvent.click(getByTestId('enhance-discard'));
		expect(ondiscard).toHaveBeenCalledTimes(1);
	});
});
