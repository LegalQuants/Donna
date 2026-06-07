// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';

const lqFetch = vi.fn();
vi.mock('$lib/server/lqClient', () => ({ lqFetch: (...a: unknown[]) => lqFetch(...a) }));
import { load, actions } from './+page.server';

const modelsBody = {
	object: 'list',
	data: [
		{
			id: 'smart',
			object: 'model',
			owned_by: 'lq-ai-gateway',
			lq_ai_kind: 'alias',
			lq_ai_resolves_to: 'anthropic-prod/claude-opus-4-7',
			routed_inference_tier: 4
		},
		{
			id: 'anthropic-prod/claude-opus-4-7',
			object: 'model',
			owned_by: 'anthropic-prod',
			lq_ai_kind: 'provider_native',
			provider_type: 'anthropic',
			routed_inference_tier: 4
		},
		{
			id: 'ollama-local/llama3.1:8b',
			object: 'model',
			owned_by: 'ollama-local',
			lq_ai_kind: 'provider_native',
			provider_type: 'ollama',
			routed_inference_tier: 1
		}
	]
};
const ev = (isAdmin: boolean) => ({ locals: { user: { is_admin: isAdmin } } }) as never;
beforeEach(() => lqFetch.mockReset());

describe('/settings/models load', () => {
	it('admin: fetches models + admin aliases, builds categories from the alias entries', async () => {
		lqFetch
			.mockResolvedValueOnce(new Response(JSON.stringify(modelsBody), { status: 200 }))
			.mockResolvedValueOnce(
				new Response(
					JSON.stringify({
						object: 'list',
						data: [
							{
								name: 'smart',
								provider: 'anthropic-prod',
								model: 'claude-opus-4-7',
								fallback: [],
								primary_inference_tier: 4
							}
						]
					}),
					{ status: 200 }
				)
			)
			.mockResolvedValueOnce(
				new Response(
					JSON.stringify({
						provider_keys: [
							{
								provider: 'anthropic-prod',
								type: 'anthropic',
								configured: true,
								last4: 'a1b2',
								source: 'env'
							}
						]
					}),
					{ status: 200 }
				)
			);
		const out = (await load(ev(true))) as {
			isAdmin: boolean;
			categories: { name: string; currentTargetId: string | null }[];
			targets: unknown[];
			localModels: unknown[];
			modelsError: boolean;
			providerKeys: unknown[] | null;
		};
		expect(lqFetch.mock.calls[0][1]).toBe('/api/v1/models');
		expect(lqFetch.mock.calls[1][1]).toBe('/api/v1/admin/aliases');
		expect(out.isAdmin).toBe(true);
		expect(out.categories[0]).toMatchObject({
			name: 'smart',
			currentTargetId: 'anthropic-prod/claude-opus-4-7'
		});
		expect(out.targets).toHaveLength(2);
		expect(out.localModels).toHaveLength(1);
		expect(out.modelsError).toBe(false);
		expect(lqFetch.mock.calls[2][1]).toBe('/api/v1/admin/provider-keys');
		expect((out as { providerKeys: unknown[] | null }).providerKeys).toHaveLength(1);
	});

	it('non-admin: skips the admin call and derives categories from /models', async () => {
		lqFetch.mockResolvedValueOnce(new Response(JSON.stringify(modelsBody), { status: 200 }));
		const out = (await load(ev(false))) as { isAdmin: boolean; categories: { name: string }[] };
		expect(lqFetch).toHaveBeenCalledTimes(1);
		expect(out.isAdmin).toBe(false);
		expect(out.categories[0].name).toBe('smart');
	});

	it('flags modelsError when /models fails', async () => {
		lqFetch.mockResolvedValueOnce(new Response('boom', { status: 500 }));
		const out = (await load(ev(false))) as { modelsError: boolean; categories: unknown[] };
		expect(out.modelsError).toBe(true);
		expect(out.categories).toEqual([]);
	});

	it('admin: when /admin/aliases fails, categories fall back to the /models-derived backings', async () => {
		lqFetch
			.mockResolvedValueOnce(new Response(JSON.stringify(modelsBody), { status: 200 }))
			.mockResolvedValueOnce(new Response('nope', { status: 503 }))
			.mockResolvedValueOnce(new Response(JSON.stringify({ provider_keys: [] }), { status: 200 }));
		const out = (await load(ev(true))) as {
			modelsError: boolean;
			categories: { name: string; currentTargetId: string | null }[];
		};
		expect(out.modelsError).toBe(false);
		expect(out.categories[0]).toMatchObject({
			name: 'smart',
			currentTargetId: 'anthropic-prod/claude-opus-4-7'
		});
	});

	it('admin: degrades providerKeys to null when the provider-keys fetch fails', async () => {
		lqFetch
			.mockResolvedValueOnce(new Response(JSON.stringify(modelsBody), { status: 200 }))
			.mockResolvedValueOnce(
				new Response(JSON.stringify({ object: 'list', data: [] }), { status: 200 })
			)
			.mockResolvedValueOnce(new Response('boom', { status: 500 }));
		const out = (await load(ev(true))) as { providerKeys: unknown };
		expect(out.providerKeys).toBeNull();
	});
	it('non-admin: providerKeys is null and no admin endpoints are called', async () => {
		lqFetch.mockResolvedValueOnce(new Response(JSON.stringify(modelsBody), { status: 200 }));
		const out = (await load(ev(false))) as { providerKeys: unknown };
		expect(out.providerKeys).toBeNull();
		expect(lqFetch).toHaveBeenCalledTimes(1);
	});
});

const form = (fields: Record<string, string>) => {
	const fd = new FormData();
	for (const [k, v] of Object.entries(fields)) fd.set(k, v);
	return { request: { formData: async () => fd }, locals: { user: { is_admin: true } } } as never;
};

describe('/settings/models ?/reassign', () => {
	it('re-reads the alias for its fallback, then PATCHes the new primary preserving it', async () => {
		lqFetch
			.mockResolvedValueOnce(new Response(JSON.stringify(modelsBody), { status: 200 })) // resolve target
			.mockResolvedValueOnce(
				new Response(
					JSON.stringify({
						name: 'smart',
						provider: 'anthropic-prod',
						model: 'claude-opus-4-7',
						fallback: [{ provider: 'openai-prod', model: 'gpt-4' }]
					}),
					{ status: 200 }
				)
			) // GET alias
			.mockResolvedValueOnce(new Response(JSON.stringify({ name: 'smart' }), { status: 200 })); // PATCH
		const res = await actions.reassign(
			form({ name: 'smart', target_id: 'ollama-local/llama3.1:8b' })
		);
		expect(res).toMatchObject({ success: true });
		expect(lqFetch.mock.calls[2][1]).toBe('/api/v1/admin/aliases/smart');
		const patchInit = lqFetch.mock.calls[2][2] as RequestInit;
		expect(patchInit.method).toBe('PATCH');
		expect(JSON.parse(patchInit.body as string)).toEqual({
			provider: 'ollama-local',
			model: 'llama3.1:8b',
			fallback: [{ provider: 'openai-prod', model: 'gpt-4' }]
		});
	});

	it('fails 400 when required fields are missing (no fetch)', async () => {
		const res = (await actions.reassign(form({}))) as { status: number; data: { message: string } };
		expect(res.status).toBe(400);
		expect(res.data.message).toMatch(/missing/i);
		expect(lqFetch).not.toHaveBeenCalled();
	});

	it('fails 400 when the target_id is not an available model', async () => {
		lqFetch.mockResolvedValueOnce(new Response(JSON.stringify(modelsBody), { status: 200 }));
		const res = (await actions.reassign(form({ name: 'smart', target_id: 'nope/not-real' }))) as {
			status: number;
			data: { message: string };
		};
		expect(res.status).toBe(400);
		expect(res.data.message).toMatch(/unknown model/i);
		expect(lqFetch).toHaveBeenCalledTimes(1); // only the models lookup; no alias GET/PATCH
	});

	it('returns a 403 failure when the backend rejects the alias read (non-admin)', async () => {
		lqFetch
			.mockResolvedValueOnce(new Response(JSON.stringify(modelsBody), { status: 200 }))
			.mockResolvedValueOnce(new Response('forbidden', { status: 403 }));
		const res = (await actions.reassign(
			form({ name: 'smart', target_id: 'ollama-local/llama3.1:8b' })
		)) as { status: number };
		expect(res.status).toBe(403);
	});
});

describe('/settings/models ?/setKey', () => {
	it('POSTs provider + api_key and succeeds with a provider echo', async () => {
		lqFetch.mockResolvedValueOnce(
			new Response(
				JSON.stringify({
					provider: 'openai-prod',
					type: 'openai',
					configured: true,
					last4: 'z9y8',
					source: 'runtime'
				}),
				{ status: 200 }
			)
		);
		const res = await actions.setKey(form({ provider: 'openai-prod', api_key: 'sk-test-123' }));
		expect(res).toMatchObject({ success: true, provider: 'openai-prod' });
		expect(lqFetch.mock.calls[0][1]).toBe('/api/v1/admin/provider-keys');
		const init = lqFetch.mock.calls[0][2] as RequestInit;
		expect(init.method).toBe('POST');
		expect(JSON.parse(init.body as string)).toEqual({
			provider: 'openai-prod',
			api_key: 'sk-test-123'
		});
	});
	it('trims surrounding whitespace from the api_key before sending upstream', async () => {
		lqFetch.mockResolvedValueOnce(
			new Response(
				JSON.stringify({
					provider: 'openai-prod',
					type: 'openai',
					configured: true,
					last4: 'a1b2',
					source: 'runtime'
				}),
				{ status: 200 }
			)
		);
		await actions.setKey(form({ provider: 'openai-prod', api_key: '  sk-pad  ' }));
		const init = lqFetch.mock.calls[0][2] as RequestInit;
		expect(JSON.parse(init.body as string)).toEqual({ provider: 'openai-prod', api_key: 'sk-pad' });
	});
	it('fails 400 with no upstream call when the key is empty', async () => {
		const res = (await actions.setKey(form({ provider: 'openai-prod', api_key: '   ' }))) as {
			status: number;
		};
		expect(res.status).toBe(400);
		expect(lqFetch).not.toHaveBeenCalled();
	});
	it('maps a master-key 400 to the operator-actionable message (string detail)', async () => {
		lqFetch.mockResolvedValueOnce(
			new Response(
				JSON.stringify({ detail: 'runtime key storage requires a master key to be set' }),
				{ status: 400 }
			)
		);
		const res = (await actions.setKey(form({ provider: 'openai-prod', api_key: 'sk-x' }))) as {
			status: number;
			data: { message: string; provider: string };
		};
		expect(res.status).toBe(400);
		expect(res.data.message).toMatch(/LQ_AI_GATEWAY_MASTER_KEY/);
		expect(res.data.provider).toBe('openai-prod');
	});
	it('maps a master-key 400 with a structured error envelope too', async () => {
		lqFetch.mockResolvedValueOnce(
			new Response(
				JSON.stringify({
					detail: {
						code: 'master_key_missing',
						message: 'runtime key storage requires a master key to be set'
					}
				}),
				{ status: 400 }
			)
		);
		const res = (await actions.setKey(form({ provider: 'openai-prod', api_key: 'sk-x' }))) as {
			status: number;
			data: { message: string };
		};
		expect(res.data.message).toMatch(/LQ_AI_GATEWAY_MASTER_KEY/);
	});
	it('maps other 400s to a generic failure', async () => {
		lqFetch.mockResolvedValueOnce(
			new Response(JSON.stringify({ detail: 'bad request' }), { status: 400 })
		);
		const res = (await actions.setKey(form({ provider: 'openai-prod', api_key: 'sk-x' }))) as {
			data: { message: string };
		};
		expect(res.data.message).toBe('Could not save the key.');
	});
	it('maps 404 unknown provider and 403 admin-required', async () => {
		lqFetch.mockResolvedValueOnce(new Response('x', { status: 404 }));
		let res = (await actions.setKey(form({ provider: 'ghost', api_key: 'sk-x' }))) as {
			status: number;
			data: { message: string };
		};
		expect(res).toMatchObject({
			status: 404,
			data: { message: 'Unknown provider.', provider: 'ghost' }
		});
		lqFetch.mockResolvedValueOnce(new Response('x', { status: 403 }));
		res = (await actions.setKey(form({ provider: 'openai-prod', api_key: 'sk-x' }))) as {
			status: number;
			data: { message: string };
		};
		expect(res.status).toBe(403);
		expect(res.data.message).toMatch(/admin account/);
	});
	it('never echoes the api_key in any payload', async () => {
		lqFetch.mockResolvedValueOnce(new Response('x', { status: 500 }));
		const res = await actions.setKey(form({ provider: 'openai-prod', api_key: 'sk-SECRET' }));
		expect(JSON.stringify(res)).not.toContain('sk-SECRET');
	});
});

describe('/settings/models ?/revokeKey', () => {
	it('DELETEs the provider key and succeeds', async () => {
		lqFetch.mockResolvedValueOnce(new Response(null, { status: 204 }));
		const res = await actions.revokeKey(form({ provider: 'openai-prod' }));
		expect(res).toMatchObject({ success: true, provider: 'openai-prod' });
		expect(lqFetch.mock.calls[0][1]).toBe('/api/v1/admin/provider-keys/openai-prod');
		expect((lqFetch.mock.calls[0][2] as RequestInit).method).toBe('DELETE');
	});
	it('treats 404 as success (already revoked)', async () => {
		lqFetch.mockResolvedValueOnce(new Response('x', { status: 404 }));
		const res = await actions.revokeKey(form({ provider: 'openai-prod' }));
		expect(res).toMatchObject({ success: true });
	});
	it('maps the env-key 409 to the env-managed message', async () => {
		lqFetch.mockResolvedValueOnce(new Response('x', { status: 409 }));
		const res = (await actions.revokeKey(form({ provider: 'anthropic-prod' }))) as {
			status: number;
			data: { message: string; provider: string };
		};
		expect(res.status).toBe(409);
		expect(res.data.message).toMatch(/can't be revoked here/);
		expect(res.data.provider).toBe('anthropic-prod');
	});
	it('fails 400 with no fetch when provider is missing', async () => {
		const res = (await actions.revokeKey(form({}))) as { status: number };
		expect(res.status).toBe(400);
		expect(lqFetch).not.toHaveBeenCalled();
	});
});
