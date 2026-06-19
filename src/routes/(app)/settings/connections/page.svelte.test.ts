import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import Page from './+page.svelte';

const data = (over: Record<string, unknown> = {}) =>
	({ servers: [], loadError: false, result: null, ...over }) as never;

describe('connections page', () => {
	it('renders a not-connected server with a Connect link', () => {
		render(Page, {
			data: data({ servers: [{ server: 'ctx7', connected: false, scopes: [], expires_at: null }] })
		});
		expect(screen.getByRole('link', { name: /^connect$/i })).toHaveAttribute(
			'href',
			'/settings/connections/ctx7/connect'
		);
	});
	it('renders a connected server with scopes + Disconnect', () => {
		render(Page, {
			data: data({
				servers: [
					{ server: 'ctx7', connected: true, scopes: ['read'], expires_at: '2099-01-01T00:00:00Z' }
				]
			})
		});
		expect(screen.getByText(/^Connected$/)).toBeInTheDocument();
		expect(screen.getByText(/read/)).toBeInTheDocument();
		expect(screen.getByRole('button', { name: /disconnect/i })).toBeInTheDocument();
	});
	it('shows a success banner from result', () => {
		render(Page, {
			data: data({
				servers: [{ server: 'ctx7', connected: true, scopes: [], expires_at: null }],
				result: { server: 'ctx7', status: 'connected' }
			})
		});
		expect(screen.getByRole('status')).toHaveTextContent(/connected to/i);
	});
	it('shows an error banner from result', () => {
		render(Page, {
			data: data({
				servers: [{ server: 'ctx7', connected: false, scopes: [], expires_at: null }],
				result: { server: 'ctx7', status: 'error', code: 'authorize_failed' }
			})
		});
		expect(screen.getByRole('alert')).toBeInTheDocument();
	});
	it('shows the empty state when no servers', () => {
		render(Page, { data: data() });
		expect(screen.getByText(/no oauth mcp servers/i)).toBeInTheDocument();
	});
});
