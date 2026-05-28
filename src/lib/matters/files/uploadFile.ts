/** Human-friendly size formatter for file rows. Switches between B / KB / MB
 *  at the conventional 1024 boundaries; one decimal place unless the value is
 *  a whole number (e.g. "2 KB" not "2.0 KB"). */
export function formatBytes(n: number): string {
  if (n === 0) return '0 B';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${formatOne(n / 1024)} KB`;
  return `${formatOne(n / 1024 / 1024)} MB`;
}

function formatOne(v: number): string {
  // Strip trailing ".0" so "2 KB" reads cleaner than "2.0 KB".
  const rounded = Math.round(v * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

export type IngestionStatus = 'pending' | 'processing' | 'ready' | 'failed' | undefined;
export type BadgeTone = 'success' | 'muted' | 'error';

/** Resolve a File's ingestion_status into a presentational label + tone. */
export function statusBadge(s: IngestionStatus): { label: string; tone: BadgeTone } {
  switch (s) {
    case 'ready': return { label: 'Ready', tone: 'success' };
    case 'failed': return { label: 'Failed', tone: 'error' };
    case 'processing': return { label: 'Processing', tone: 'muted' };
    case 'pending':
    default:
      return { label: 'Pending', tone: 'muted' };
  }
}
