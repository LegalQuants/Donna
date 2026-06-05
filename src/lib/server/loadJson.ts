// Shared SSR load helper: parse a fetch Response as JSON, or return a fallback
// when the response is not ok or the body is unparseable. Used by route `load`
// functions that degrade ancillary data instead of failing the whole page.
export async function jsonOr<T>(res: Response, fallback: T): Promise<T> {
  if (!res.ok) return fallback;
  try {
    return (await res.json()) as T;
  } catch {
    return fallback;
  }
}
