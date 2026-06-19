import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import McpServerCard from './McpServerCard.svelte';

const server = (auth: string) => ({ name: 'ctx7', type: 'mcp', auth, tools: [] }) as never;

describe('McpServerCard OAuth badge', () => {
	it('shows an OAuth badge for oauth servers', () => {
		render(McpServerCard, { server: server('oauth') });
		expect(screen.getByText('OAuth')).toBeInTheDocument();
	});
	it('shows no OAuth badge for none/bearer', () => {
		render(McpServerCard, { server: server('none') });
		expect(screen.queryByText('OAuth')).not.toBeInTheDocument();
	});
});
