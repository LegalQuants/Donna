/** Splice `insert` into `value` over the [start,end) range; returns the new
 *  string and the caret position just after the inserted text. Pure — the
 *  composer applies the DOM focus/selection separately. */
export function spliceText(
  value: string,
  start: number,
  end: number,
  insert: string
): { value: string; caret: number } {
  const next = value.slice(0, start) + insert + value.slice(end);
  return { value: next, caret: start + insert.length };
}
