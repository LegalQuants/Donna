import type { RequestHandler } from './$types';
import { lqFetch } from '$lib/server/lqClient';
import { json, error } from '@sveltejs/kit';

export const GET: RequestHandler = async (event) => {
  const res = await lqFetch(event, `/api/v1/files/${event.params.id}`);
  if (!res.ok) throw error(res.status === 404 ? 404 : 502, 'Could not load file.');
  const file = (await res.json()) as { filename?: string; page_count?: number | null };
  return json({ filename: file.filename ?? null, page_count: file.page_count ?? null });
};
