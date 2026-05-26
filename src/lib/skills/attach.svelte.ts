import type { SkillSuggestion, AttachedSkill } from './types';

export function createSkillAttach() {
  let attached = $state<AttachedSkill[]>([]);
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
    get attached() {
      return attached;
    },
    get results() {
      return results;
    },
    get loading() {
      return loading;
    },
    get error() {
      return error;
    },
    /** Slugs to send as MessageCreate.skills. */
    get names() {
      return attached.map((s) => s.slug);
    },
    open: (fetchFn: typeof fetch = fetch) => fetchResults('', fetchFn),
    search: (q: string, fetchFn: typeof fetch = fetch) => fetchResults(q, fetchFn),
    attach(s: SkillSuggestion) {
      if (attached.some((a) => a.slug === s.slug)) return;
      attached = [...attached, { slug: s.slug, title: s.title }];
    },
    remove(slug: string) {
      attached = attached.filter((a) => a.slug !== slug);
    }
  };
}
