import { describe, it, expect } from 'vitest';
import { toolUsageNote } from './types';

describe('toolUsageNote', () => {
	it('returns null when the skill declares no tool usage', () => {
		expect(toolUsageNote({ tool_usage: null, unavailable_tool_usage: null })).toBeNull();
		expect(toolUsageNote({ tool_usage: [], unavailable_tool_usage: [] })).toBeNull();
	});

	it('reports declared connectors when all are available', () => {
		expect(toolUsageNote({ tool_usage: ['courtlistener'], unavailable_tool_usage: [] })).toEqual({
			text: 'Uses: courtlistener',
			unavailable: []
		});
	});

	it('treats null unavailable as available (undeterminable, never an error)', () => {
		expect(toolUsageNote({ tool_usage: ['courtlistener'], unavailable_tool_usage: null })).toEqual({
			text: 'Uses: courtlistener',
			unavailable: []
		});
	});

	it('flags unavailable connectors', () => {
		expect(
			toolUsageNote({ tool_usage: ['courtlistener'], unavailable_tool_usage: ['courtlistener'] })
		).toEqual({ text: 'Uses: courtlistener', unavailable: ['courtlistener'] });
	});
});
