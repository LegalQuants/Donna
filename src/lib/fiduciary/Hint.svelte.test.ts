/// <reference types="@testing-library/jest-dom/vitest" />
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';
import { createRawSnippet } from 'svelte';
import Hint from './Hint.svelte';
import { hintStore } from './hints.svelte';

beforeEach(() => localStorage.clear());

// A snippet that renders static text (single root element, per createRawSnippet).
const body = (text: string) => createRawSnippet(() => ({ render: () => `<span>${text}</span>` }));

describe('Hint', () => {
	it('renders its children and a dismiss button when not dismissed', () => {
		render(Hint, { props: { id: 'hint-render', children: body('trace the sources') } });
		expect(screen.getByText('trace the sources')).toBeInTheDocument();
		expect(screen.getByRole('button', { name: 'Dismiss hint' })).toBeInTheDocument();
	});
	it('dismissing hides the callout and marks the id dismissed', async () => {
		render(Hint, { props: { id: 'hint-dismiss', children: body('dismiss me') } });
		await fireEvent.click(screen.getByRole('button', { name: 'Dismiss hint' }));
		expect(screen.queryByText('dismiss me')).not.toBeInTheDocument();
		expect(hintStore.isDismissed('hint-dismiss')).toBe(true);
	});
	it('renders nothing when the id is already dismissed', () => {
		hintStore.dismiss('hint-pre');
		render(Hint, { props: { id: 'hint-pre', children: body('should not show') } });
		expect(screen.queryByText('should not show')).not.toBeInTheDocument();
	});
});
