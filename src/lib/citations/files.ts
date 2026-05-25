// Client-side filename resolver. One in-flight/result promise per file id.
const cache = new Map<string, Promise<string | null>>();

export function fileName(id: string): Promise<string | null> {
  let p = cache.get(id);
  if (!p) {
    p = fetch(`/files/${id}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => (d && typeof d.filename === 'string' ? d.filename : null))
      .catch(() => null);
    cache.set(id, p);
  }
  return p;
}

/** Test-only: clear the cache between cases. */
export function _resetFileCache(): void {
  cache.clear();
}
