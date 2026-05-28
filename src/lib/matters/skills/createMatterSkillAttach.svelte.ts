import type { SkillSuggestion } from '$lib/skills/types';

/** Matter-scoped controller for the reused composer SkillAttach.svelte popover.
 *  Mirrors the composer's controller's reactive surface ({ results, loading,
 *  error, open, search, attach }) but delegates attach to a caller-provided
 *  callback — which submits the matter form action — instead of holding local
 *  attached state. The persistent 'attached' list comes from
 *  matter.attached_skill_names on every load. */
export function createMatterSkillAttach({ onattach }: { onattach: (slug: string) => void }) {
  let results = $state<SkillSuggestion[]>([]);
  let loading = $state(false);
  let error = $state(false);

  async function fetchResults(q: string, fetchFn: typeof fetch) {
    loading = true;
    error = false;
    try {
      const res = await fetchFn(`/skills/autocomplete?q=${encodeURIComponent(q)}&limit=8`);
      if (!res.ok) throw new Error(String(res.status));
      const body = (await res.json()) as { results: SkillSuggestion[] };
      results = body.results ?? [];
    } catch {
      error = true;
      results = [];
    } finally {
      loading = false;
    }
  }

  return {
    get results() { return results; },
    get loading() { return loading; },
    get error() { return error; },
    open: (fetchFn: typeof fetch = fetch) => fetchResults('', fetchFn),
    search: (q: string, fetchFn: typeof fetch = fetch) => fetchResults(q, fetchFn),
    attach(s: SkillSuggestion) {
      onattach(s.slug);
    }
  };
}
