import { describe, it, expect } from 'vitest';
import { parseMcpServers, parseMcpTools, toolBadges } from './mcp';

const tool = (over = {}) => ({
	name: 'read_file',
	description: 'Reads a file.',
	read_only: true,
	destructive: false,
	requires_confirmation: false,
	enabled: true,
	...over
});

describe('parseMcpServers', () => {
	it('parses servers + tools, drops malformed rows', () => {
		const out = parseMcpServers({
			servers: [
				{ name: 'fs', type: 'mcp', tools: [tool(), 42, { description: 'no name' }] },
				99,
				{ type: 'mcp' } // no name → dropped
			]
		});
		expect(out).toHaveLength(1);
		expect(out[0]).toMatchObject({ name: 'fs', type: 'mcp' });
		expect(out[0].tools).toHaveLength(1);
		expect(out[0].tools[0]).toMatchObject({ name: 'read_file', read_only: true, enabled: true });
	});
	it('empty on junk', () => {
		expect(parseMcpServers(null)).toEqual([]);
		expect(parseMcpServers({ servers: 'nope' })).toEqual([]);
	});
	it('boolean flags default to false when absent', () => {
		const out = parseMcpServers({ servers: [{ name: 's', type: 'mcp', tools: [{ name: 't' }] }] });
		expect(out[0].tools[0]).toMatchObject({
			read_only: false,
			destructive: false,
			requires_confirmation: false,
			enabled: false,
			description: null
		});
	});
});

describe('parseMcpTools', () => {
	it('parses a refresh response tool list', () => {
		expect(parseMcpTools({ server: 'fs', tools: [tool({ name: 'x' })] })).toEqual([
			expect.objectContaining({ name: 'x' })
		]);
	});
	it('empty on junk', () => {
		expect(parseMcpTools(null)).toEqual([]);
	});
});

describe('toolBadges', () => {
	it('derives one badge per active flag, in order', () => {
		expect(
			toolBadges(tool({ read_only: true, destructive: true, requires_confirmation: true }))
		).toEqual([
			{ label: 'read-only', kind: 'info' },
			{ label: 'destructive', kind: 'danger' },
			{ label: 'needs confirmation', kind: 'warn' }
		]);
	});
	it('no badges when all flags false', () => {
		expect(toolBadges(tool({ read_only: false }))).toEqual([]);
	});
});
