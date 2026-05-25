import { citeState, type CiteState, type Citation } from './types';

const ANY_MARKER = /\(Source:\s*\[\d+\]\)/;
const QUOTE_MARKER = /"([^"]+)"(\s*)\(Source:\s*\[(\d+)\]\)/g;
const BARE_MARKER = /\(Source:\s*\[(\d+)\]\)/g;

export function hasCitationMarkers(content: string): boolean {
  return ANY_MARKER.test(content ?? '');
}

function tab(index: number, state: CiteState): string {
  return (
    `<span class="cite-tab cite-${state}" data-cite-index="${index}" ` +
    `role="button" tabindex="0" aria-label="Citation ${index}, ${state}">${index}</span>`
  );
}

function stateFor(citations: Citation[], index: number): CiteState {
  return citeState(citations[index - 1]);
}

/**
 * Layer citation pills onto already-sanitized markdown HTML. Tag-aware: the marker
 * regex runs only on text segments, never on tag/attribute segments. Inserts only
 * static markup + an integer index — no citation text enters the HTML.
 */
export function transformCitations(sanitizedHtml: string, citations: Citation[] = []): string {
  // Odd indices are the captured tags (<...>); even indices are text between tags.
  return sanitizedHtml
    .split(/(<[^>]+>)/)
    .map((seg, i) => {
      if (i % 2 === 1) return seg; // tag — leave untouched
      let out = seg.replace(QUOTE_MARKER, (_m, quote: string, _ws: string, n: string) => {
        const idx = Number(n);
        const state = stateFor(citations, idx);
        return `<span class="cite-quote cite-${state}">&quot;${quote}&quot;</span>${tab(idx, state)}`;
      });
      // Second pass: plain (Source: [N]) not already consumed by QUOTE_MARKER above.
      // Because both passes run on the same segment, a (Source: [N]) literal that
      // appears *inside* a quoted passage (pathological content) would survive the first
      // pass and land here as a spurious bare pill — acceptable/graceful degradation.
      out = out.replace(BARE_MARKER, (_m, n: string) => {
        const idx = Number(n);
        return tab(idx, stateFor(citations, idx));
      });
      return out;
    })
    .join('');
}
