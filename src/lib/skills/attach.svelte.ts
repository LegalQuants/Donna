import type { SkillSuggestion, AttachedSkill, SkillInputs } from './types';

function provided(v: unknown): boolean {
  if (typeof v === 'string') return v.trim().length > 0;
  if (typeof v === 'number') return Number.isFinite(v);
  return v != null;
}

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

  async function fetchInputs(slug: string, fetchFn: typeof fetch) {
    const entry = attached.find((a) => a.slug === slug);
    if (!entry) return;
    try {
      const res = await fetchFn(`/skills/${encodeURIComponent(slug)}/inputs`);
      if (!res.ok) throw new Error(String(res.status));
      const body = (await res.json()) as SkillInputs;
      entry.required = body.required ?? [];
      entry.optional = body.optional ?? [];
      const seed: Record<string, unknown> = {};
      for (const def of [...entry.required, ...entry.optional]) {
        if (def.type === 'boolean') seed[def.name] = def.default ?? false;
        else if (def.default != null) seed[def.name] = def.default;
      }
      entry.values = seed;
    } catch {
      entry.inputsError = true;
    } finally {
      entry.inputsLoading = false;
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
    /** MessageCreate.skill_inputs: { [slug]: {…provided values} }, valueless skills omitted. */
    get skillInputs() {
      const out: Record<string, Record<string, unknown>> = {};
      for (const a of attached) {
        const vals: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(a.values)) if (provided(v)) vals[k] = v;
        if (Object.keys(vals).length) out[a.slug] = vals;
      }
      return out;
    },
    /** True when every attached skill's required inputs are all provided. */
    get allRequiredFilled() {
      return attached.every((a) => a.required.every((d) => provided(a.values[d.name])));
    },
    open: (fetchFn: typeof fetch = fetch) => fetchResults('', fetchFn),
    search: (q: string, fetchFn: typeof fetch = fetch) => fetchResults(q, fetchFn),
    async attach(s: SkillSuggestion, fetchFn: typeof fetch = fetch) {
      if (attached.some((a) => a.slug === s.slug)) return;
      attached = [...attached, { slug: s.slug, title: s.title, inputsLoading: true, inputsError: false, required: [], optional: [], values: {} }];
      await fetchInputs(s.slug, fetchFn);
    },
    setInputValue(slug: string, name: string, value: unknown) {
      const entry = attached.find((a) => a.slug === slug);
      if (!entry) return;
      if (value === undefined) {
        const next = { ...entry.values };
        delete next[name];
        entry.values = next;
      } else {
        entry.values = { ...entry.values, [name]: value };
      }
    },
    remove(slug: string) {
      attached = attached.filter((a) => a.slug !== slug);
    }
  };
}
