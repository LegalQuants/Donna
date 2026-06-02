import type { RequestHandler } from './$types';
import { lqFetch } from '$lib/server/lqClient';
import { json, error } from '@sveltejs/kit';

// Only the two preferences Donna currently honors are accepted; anything else is
// a client bug (or an attempt to set an unconsumed field) → 400.
const ALLOWED = new Set(['trust_pills', 'provenance_pills']);

export const PATCH: RequestHandler = async (event) => {
  const body = (await event.request.json().catch(() => null)) as Record<string, unknown> | null;
  const keys = body ? Object.keys(body) : [];
  if (!body || keys.length === 0 || keys.some((k) => !ALLOWED.has(k))) {
    throw error(400, 'Unknown preference field.');
  }
  const res = await lqFetch(event, '/api/v1/users/me/preferences', {
    method: 'PATCH',
    body: JSON.stringify(body)
  });
  if (!res.ok) {
    const status = res.status === 404 || res.status === 503 || res.status === 504 ? res.status : 502;
    throw error(status, 'Could not save preferences.');
  }
  return json(await res.json());
};
