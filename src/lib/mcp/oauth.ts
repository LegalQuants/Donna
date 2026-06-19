// View-models + defensive parser for the per-user MCP OAuth surface
// (GET /api/v1/mcp/oauth, pin 6a6e83e / PR4d). Guards at the boundary and drops
// malformed rows — same style as mcp.ts / automations/findings.ts.

export interface OAuthServerStatus {
	server: string;
	connected: boolean;
	scopes: string[];
	expires_at: string | null;
}

export type OAuthExpiry = 'valid' | 'expiring' | 'expired' | 'none';

function obj(v: unknown): Record<string, unknown> {
	return v && typeof v === 'object' ? (v as Record<string, unknown>) : {};
}
function str(v: unknown): string | null {
	return typeof v === 'string' ? v : null;
}
function strArray(v: unknown): string[] {
	return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
}

export function parseOAuthServers(raw: unknown): OAuthServerStatus[] {
	const r = obj(raw);
	return (Array.isArray(r.servers) ? r.servers : [])
		.map((s) => {
			const o = obj(s);
			if (typeof o.server !== 'string') return null;
			return {
				server: o.server,
				connected: o.connected === true,
				scopes: strArray(o.scopes),
				expires_at: str(o.expires_at)
			};
		})
		.filter((s): s is OAuthServerStatus => s !== null);
}

/** Connection-expiry bucket for display. `expiring` = within 24h of `now`. */
export function oauthExpiry(expires_at: string | null, now: number = Date.now()): OAuthExpiry {
	if (!expires_at) return 'none';
	const t = Date.parse(expires_at);
	if (Number.isNaN(t)) return 'none';
	if (t <= now) return 'expired';
	if (t - now <= 24 * 60 * 60 * 1000) return 'expiring';
	return 'valid';
}
