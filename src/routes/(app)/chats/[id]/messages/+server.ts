import type { RequestHandler } from './$types';
import { lqStream } from '$lib/server/lqClient';

export const POST: RequestHandler = async (event) => {
	let content = '';
	let model = 'smart';
	let skills: string[] = [];
	let skillInputs: Record<string, Record<string, unknown>> = {};
	let fileIds: string[] = [];
	try {
		const body = (await event.request.json()) as {
			content?: string;
			model?: string;
			skills?: string[];
			skill_inputs?: unknown;
			file_ids?: unknown;
		};
		content = (body.content ?? '').trim();
		const m = (body.model ?? '').trim();
		if (m) model = m;
		if (Array.isArray(body.skills))
			skills = body.skills.filter((s): s is string => typeof s === 'string');
		if (
			body.skill_inputs &&
			typeof body.skill_inputs === 'object' &&
			!Array.isArray(body.skill_inputs)
		) {
			const si: Record<string, Record<string, unknown>> = {};
			for (const [k, v] of Object.entries(body.skill_inputs as Record<string, unknown>)) {
				if (v && typeof v === 'object' && !Array.isArray(v)) si[k] = v as Record<string, unknown>;
			}
			skillInputs = si;
		}
		if (Array.isArray(body.file_ids))
			fileIds = body.file_ids.filter((s): s is string => typeof s === 'string');
	} catch {
		content = '';
	}

	const payload: {
		content: string;
		model: string;
		stream: true;
		skills?: string[];
		skill_inputs?: Record<string, Record<string, unknown>>;
		file_ids?: string[];
	} = { content, model, stream: true };
	if (skills.length) payload.skills = skills;
	if (Object.keys(skillInputs).length) payload.skill_inputs = skillInputs;
	if (fileIds.length) payload.file_ids = fileIds;

	const upstream = await lqStream(event, `/api/v1/chats/${event.params.id}/messages`, {
		method: 'POST',
		body: JSON.stringify(payload)
	});

	// Pipe the upstream SSE body straight through (no buffering). On a non-2xx
	// upstream the body is the JSON error envelope; forward status + body so the
	// client's res.ok check surfaces it.
	return new Response(upstream.body, {
		status: upstream.status,
		headers: {
			'content-type': upstream.headers.get('content-type') ?? 'text/event-stream',
			'cache-control': 'no-cache'
		}
	});
};
