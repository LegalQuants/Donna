import {
	parseSearchResponse,
	parseClusterView,
	parseFindMatches,
	parseCitations,
	type SearchResultItem,
	type ClusterView,
	type FindMatch,
	type VerifiedCitation
} from './research';

export function createResearch(fetchFn: typeof fetch = fetch) {
	let query = $state('');
	let results = $state<SearchResultItem[]>([]);
	let nextCursor = $state<string | null>(null);
	let count = $state<number | null>(null);
	let cluster = $state<ClusterView | null>(null);
	let matches = $state<FindMatch[]>([]);
	let citations = $state<VerifiedCitation[]>([]);
	let loading = $state(false);
	let error = $state<string | null>(null);
	let notEnabled = $state(false);

	async function post(url: string, payload: unknown): Promise<unknown | null> {
		const res = await fetchFn(url, {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify(payload)
		});
		if (res.status === 503) {
			notEnabled = true;
			return null;
		}
		if (!res.ok) {
			error = 'Something went wrong — try again.';
			return null;
		}
		return res.json();
	}

	async function search(q: string) {
		query = q;
		if (!q.trim()) return;
		loading = true;
		error = null;
		try {
			const raw = await post('/research/search', { q });
			if (raw) {
				const parsed = parseSearchResponse(raw);
				results = parsed.results;
				count = parsed.count;
				nextCursor = parsed.nextCursor;
			}
		} finally {
			// Always clear the spinner — a thrown fetch must not leave the Search
			// button permanently disabled (`disabled={r.loading}` on the page).
			loading = false;
		}
	}

	async function openCluster(id: number) {
		error = null;
		const res = await fetchFn(`/research/clusters/${id}`);
		if (res.status === 503) {
			notEnabled = true;
			return;
		}
		if (!res.ok) {
			error = 'Could not load that case.';
			return;
		}
		cluster = parseClusterView(await res.json());
		matches = [];
	}

	async function findInCase(opinionId: number, q: string) {
		if (!q.trim()) return;
		const raw = await post('/research/find-in-case', {
			opinion_id: opinionId,
			query: q,
			max_matches: 10
		});
		if (raw) matches = parseFindMatches(raw);
	}

	async function verify(text: string) {
		if (!text.trim()) return;
		const raw = await post('/research/verify-citations', { text });
		if (raw) citations = parseCitations(raw);
	}

	return {
		get query() {
			return query;
		},
		get results() {
			return results;
		},
		get count() {
			return count;
		},
		get nextCursor() {
			return nextCursor;
		},
		get cluster() {
			return cluster;
		},
		get matches() {
			return matches;
		},
		get citations() {
			return citations;
		},
		get loading() {
			return loading;
		},
		get error() {
			return error;
		},
		get notEnabled() {
			return notEnabled;
		},
		search,
		openCluster,
		findInCase,
		verify
	};
}

export type Research = ReturnType<typeof createResearch>;
