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

	// Remember the filters of the current result set so loadMore() can page
	// forward with the same court/order_by (the cursor alone doesn't carry them).
	let lastFilters = $state<{ court?: string; order_by?: string }>({});

	async function search(
		q: string,
		filters: { court?: string; order_by?: string } = {},
		opts: { append?: boolean } = {}
	) {
		query = q;
		if (!q.trim()) return;
		if (!opts.append) lastFilters = filters;
		loading = true;
		error = null;
		try {
			const body: Record<string, unknown> = { q };
			if (filters.court?.trim()) body.court = filters.court.trim();
			if (filters.order_by?.trim()) body.order_by = filters.order_by.trim();
			if (opts.append && nextCursor) body.cursor = nextCursor;
			const raw = await post('/research/search', body);
			if (raw) {
				const parsed = parseSearchResponse(raw);
				// Append on load-more; replace on a fresh search.
				results = opts.append ? [...results, ...parsed.results] : parsed.results;
				count = parsed.count;
				nextCursor = parsed.nextCursor;
			}
		} finally {
			// Always clear the spinner — a thrown fetch must not leave the Search
			// button permanently disabled (`disabled={r.loading}` on the page).
			loading = false;
		}
	}

	/** Fetch the next page of the current search and append it. No-op when there's nothing more. */
	async function loadMore() {
		if (!nextCursor || loading) return;
		await search(query, lastFilters, { append: true });
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
		error = null;
		if (!q.trim()) return;
		const raw = await post('/research/find-in-case', {
			opinion_id: opinionId,
			query: q,
			max_matches: 10
		});
		if (raw) matches = parseFindMatches(raw);
	}

	async function verify(text: string) {
		error = null;
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
		loadMore,
		openCluster,
		findInCase,
		verify
	};
}

export type Research = ReturnType<typeof createResearch>;
