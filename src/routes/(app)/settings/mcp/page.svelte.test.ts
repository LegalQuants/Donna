import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import Page from './+page.svelte';

const server = {
	name: 'filesystem',
	type: 'mcp',
	tools: [
		{
			name: 'read_file',
			description: 'Reads.',
			read_only: true,
			destructive: false,
			requires_confirmation: false,
			enabled: true
		},
		{
			name: 'write_file',
			description: 'Writes.',
			read_only: false,
			destructive: true,
			requires_confirmation: true,
			enabled: false
		}
	]
};

describe('mcp settings page', () => {
	it('non-admin sees the managed-by-admin note, no servers', () => {
		render(Page, { data: { isAdmin: false, servers: [], mcpError: false } } as never);
		expect(screen.getByText(/managed by your administrator/i)).toBeInTheDocument();
	});
	it('admin sees servers + tools + badges', () => {
		render(Page, { data: { isAdmin: true, servers: [server], mcpError: false } } as never);
		expect(screen.getByText('filesystem')).toBeInTheDocument();
		expect(screen.getByText('read_file')).toBeInTheDocument();
		expect(screen.getByText('write_file')).toBeInTheDocument();
		expect(screen.getByText('destructive')).toBeInTheDocument();
	});
	it('admin with no servers sees the empty state', () => {
		render(Page, { data: { isAdmin: true, servers: [], mcpError: false } } as never);
		expect(screen.getByText(/no mcp servers configured/i)).toBeInTheDocument();
	});
	it('shows the unavailable state on mcpError', () => {
		render(Page, { data: { isAdmin: true, servers: [], mcpError: true } } as never);
		expect(screen.getByText(/unavailable/i)).toBeInTheDocument();
	});
});
