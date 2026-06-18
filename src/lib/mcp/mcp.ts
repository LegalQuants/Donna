// src/lib/mcp/mcp.ts
// View-models + defensive parsers for the /api/v1/admin/mcp surface (WS2, pin
// 8142d58). The backend types these (named MCPServerView/MCPToolView), but tool
// name/description/flags are MCP-discovery-sourced (third-party), so we guard at
// the boundary and drop malformed rows — same style as automations/findings.ts.

export interface McpTool {
	name: string;
	description: string | null;
	read_only: boolean;
	destructive: boolean;
	requires_confirmation: boolean;
	enabled: boolean;
}

export interface McpServer {
	name: string;
	type: string;
	tools: McpTool[];
}

export type BadgeKind = 'info' | 'danger' | 'warn';
export interface ToolBadge {
	label: string;
	kind: BadgeKind;
}

function obj(v: unknown): Record<string, unknown> {
	return v && typeof v === 'object' ? (v as Record<string, unknown>) : {};
}
function str(v: unknown): string | null {
	return typeof v === 'string' ? v : null;
}
function bool(v: unknown): boolean {
	return v === true;
}

function parseTool(raw: unknown): McpTool | null {
	const r = obj(raw);
	if (typeof r.name !== 'string') return null;
	return {
		name: r.name,
		description: str(r.description),
		read_only: bool(r.read_only),
		destructive: bool(r.destructive),
		requires_confirmation: bool(r.requires_confirmation),
		enabled: bool(r.enabled)
	};
}

function parseToolList(raw: unknown): McpTool[] {
	return (Array.isArray(raw) ? raw : []).map(parseTool).filter((t): t is McpTool => t !== null);
}

export function parseMcpServers(raw: unknown): McpServer[] {
	const r = obj(raw);
	return (Array.isArray(r.servers) ? r.servers : [])
		.map((s) => {
			const o = obj(s);
			if (typeof o.name !== 'string') return null;
			return {
				name: o.name,
				type: str(o.type) ?? '',
				tools: parseToolList(o.tools)
			};
		})
		.filter((s): s is McpServer => s !== null);
}

/** Tool list from a `POST /{server}/refresh` response (`{ server, tools }`). */
export function parseMcpTools(raw: unknown): McpTool[] {
	return parseToolList(obj(raw).tools);
}

/** One badge per active metadata flag, in a fixed order. Reused by Slice C. */
export function toolBadges(t: McpTool): ToolBadge[] {
	const badges: ToolBadge[] = [];
	if (t.read_only) badges.push({ label: 'read-only', kind: 'info' });
	if (t.destructive) badges.push({ label: 'destructive', kind: 'danger' });
	if (t.requires_confirmation) badges.push({ label: 'needs confirmation', kind: 'warn' });
	return badges;
}
