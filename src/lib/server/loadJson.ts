// Shared SSR load helper: parse a fetch Response as JSON, or return a fallback
// when the response is not ok or the body is unparseable. Used by route `load`
// functions that degrade ancillary data instead of failing the whole page.
// Also hosts `errorDetail`, used by form actions to discriminate backend error causes.
export async function jsonOr<T>(res: Response, fallback: T): Promise<T> {
	if (!res.ok) return fallback;
	try {
		return (await res.json()) as T;
	} catch {
		return fallback;
	}
}

/** The `detail` string from an error-response body, or '' when the body is not
 *  JSON / has no string detail. Lets actions branch on backend 404 causes
 *  (e.g. "project not found" vs "autonomous schedule not found") without trusting the body. */
export async function errorDetail(res: Response): Promise<string> {
	try {
		const j = (await res.json()) as { detail?: unknown };
		return typeof j.detail === 'string' ? j.detail : '';
	} catch {
		return '';
	}
}
