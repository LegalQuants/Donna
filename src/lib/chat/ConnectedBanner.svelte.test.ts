/// <reference types="@testing-library/jest-dom/vitest" />
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import ConnectedBanner from './ConnectedBanner.svelte';

describe('ConnectedBanner', () => {
	it('shows a connected banner with a Retry that fires onretry', () => {
		let retried = false;
		render(ConnectedBanner, { props: { server: 'context7', onretry: () => (retried = true) } });
		expect(screen.getByText(/connected to/i)).toHaveTextContent(/context7/);
		screen.getByRole('button', { name: /retry|re-send/i }).click();
		expect(retried).toBe(true);
	});
	it('shows an error banner when error is set', () => {
		render(ConnectedBanner, { props: { error: 'context7', onretry: () => {} } });
		expect(screen.getByRole('alert')).toHaveTextContent(/couldn|could not/i);
	});
	it('renders nothing when neither server nor error is set', () => {
		const { container } = render(ConnectedBanner, { props: { onretry: () => {} } });
		expect(container.textContent?.trim()).toBe('');
	});
});
