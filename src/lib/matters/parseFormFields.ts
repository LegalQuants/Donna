/** Helpers for parsing matter form-action submissions. The two parse helpers
 *  read the exact HTML wire format MatterForm.svelte emits:
 *
 *  - `privileged` is an `<input type="checkbox">`, so it is `"on"` when checked
 *    and absent (`null`) when unchecked.
 *  - `minimum_inference_tier` is a `<select>` with values `""` (None) or
 *    `"1"`..`"5"`.
 *
 *  Shared by the `/matters` create action and the `/matters/[id]` rename
 *  action; centralizing avoids drift. */

export type MinimumInferenceTier = 1 | 2 | 3 | 4 | 5;

/** Parse the privileged + minimum_inference_tier fields from a matter
 *  form-action submission. Range-guarded so a manipulated POST cannot
 *  smuggle an out-of-range tier past the type system; values outside
 *  1..5 are normalized to null. */
export function parsePrivilegeFields(data: FormData): {
  privileged: boolean;
  minimum_inference_tier: MinimumInferenceTier | null;
} {
  const privileged = data.get('privileged') === 'on';
  const raw = String(data.get('minimum_inference_tier') ?? '');
  if (raw === '') return { privileged, minimum_inference_tier: null };
  const n = Number(raw);
  const tier = n === 1 || n === 2 || n === 3 || n === 4 || n === 5 ? (n as MinimumInferenceTier) : null;
  return { privileged, minimum_inference_tier: tier };
}
