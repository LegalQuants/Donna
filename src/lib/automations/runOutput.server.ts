// src/lib/automations/runOutput.server.ts
// Server-side loader for a run's work-product (findings + proposed memories +
// document-grade artifact refs), shared by the [id] SSR load and the [id] poll
// proxy. Degrades each key to null on failure — the receipt page must never
// fail because of Results.
import { lqFetch } from '$lib/server/lqClient';
import {
	parseFindingList,
	parseRunMemories,
	type FindingItem,
	type RunMemoryItem
} from './findings';
import { parseArtifactList, type ArtifactItem } from './artifacts';
import type { RequestEvent } from '@sveltejs/kit';

export interface RunOutput {
	findings: FindingItem[] | null;
	findings_total: number | null;
	memories: RunMemoryItem[] | null;
	memories_total: number | null;
	artifacts: ArtifactItem[] | null;
	artifacts_total: number | null;
}

export async function loadRunOutput(event: RequestEvent, sessionId: string): Promise<RunOutput> {
	const [fRes, mRes, aRes] = await Promise.all([
		lqFetch(event, `/api/v1/autonomous/sessions/${sessionId}/findings?limit=200`),
		lqFetch(
			event,
			`/api/v1/autonomous/memory?source_session_id=${encodeURIComponent(sessionId)}&limit=200`
		),
		lqFetch(event, `/api/v1/autonomous/sessions/${sessionId}/artifacts?limit=200`)
	]);
	let findings: FindingItem[] | null = null;
	let findings_total: number | null = null;
	if (fRes.ok) {
		try {
			const parsed = parseFindingList(await fRes.json());
			findings = parsed.findings;
			findings_total = parsed.total;
		} catch {
			// non-JSON body → Results unavailable
		}
	}
	let memories: RunMemoryItem[] | null = null;
	let memories_total: number | null = null;
	if (mRes.ok) {
		try {
			const parsed = parseRunMemories(await mRes.json());
			memories = parsed.memories;
			memories_total = parsed.total;
		} catch {
			// non-JSON body → sub-section hidden
		}
	}
	let artifacts: ArtifactItem[] | null = null;
	let artifacts_total: number | null = null;
	if (aRes.ok) {
		try {
			const parsed = parseArtifactList(await aRes.json());
			artifacts = parsed.artifacts;
			artifacts_total = parsed.total;
		} catch {
			// non-JSON body → Documents block hidden
		}
	}
	return { findings, findings_total, memories, memories_total, artifacts, artifacts_total };
}
