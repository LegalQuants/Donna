// Locate a cited quote in a rendered PDF.js text layer and highlight it via the
// CSS Custom Highlight API. Pure + DOM-only (no pdfjs import) so the search core
// unit-tests in jsdom. The text layer splits text across many <span>s, so we
// concatenate their text nodes, normalize (collapse whitespace, NFKC-fold
// ligatures, drop soft hyphens) on BOTH sides, substring-match, and map the
// normalized match back to real DOM positions to build a Range.

const HIGHLIGHT_NAME = 'cite';

/** Yield normalized characters with the raw (UTF-16) index they came from. Iterates by
 *  code point so match boundaries never land inside a surrogate pair. */
function* normalizedChars(s: string): Generator<{ ch: string; rawIndex: number }> {
  let prevSpace = false;
  let i = 0;
  for (const c of s) {
    const rawIndex = i;
    i += c.length; // advance by UTF-16 code-unit width (1 or 2)
    if (c === '­') continue; // soft hyphen — drop
    const folded = c.normalize('NFKC'); // ﬁ → "fi", etc.
    for (const ch0 of folded) {
      if (/\s/.test(ch0)) {
        if (prevSpace) continue; // collapse whitespace runs
        prevSpace = true;
        yield { ch: ' ', rawIndex };
      } else {
        prevSpace = false;
        yield { ch: ch0, rawIndex };
      }
    }
  }
}

function normalize(s: string): string {
  let out = '';
  for (const { ch } of normalizedChars(s)) out += ch;
  return out;
}

export function findQuoteRange(textLayerEl: HTMLElement, quote: string): Range | null {
  const qnorm = normalize(quote).trim();
  if (!qnorm) return null;

  // Collect text nodes in document order with a per-raw-char {node, offset} map.
  const walker = document.createTreeWalker(textLayerEl, NodeFilter.SHOW_TEXT);
  let raw = '';
  const nodeAt: { node: Text; offset: number }[] = [];
  let n: Node | null;
  while ((n = walker.nextNode())) {
    const t = n as Text;
    for (let i = 0; i < t.data.length; i++) nodeAt.push({ node: t, offset: i });
    raw += t.data;
  }

  // Normalized string + map from normalized index → global raw index.
  let norm = '';
  const normToRaw: number[] = [];
  for (const { ch, rawIndex } of normalizedChars(raw)) {
    norm += ch;
    normToRaw.push(rawIndex);
  }

  const idx = norm.indexOf(qnorm); // first occurrence wins
  if (idx === -1) return null;

  const start = nodeAt[normToRaw[idx]];
  const end = nodeAt[normToRaw[idx + qnorm.length - 1]];
  if (!start || !end) return null;

  const range = document.createRange();
  range.setStart(start.node, start.offset);
  const endCp = end.node.data.codePointAt(end.offset) ?? 0;
  range.setEnd(end.node, end.offset + (endCp > 0xffff ? 2 : 1)); // include the full final code point
  return range;
}

function highlightsSupported(): boolean {
  return typeof CSS !== 'undefined' && !!CSS.highlights && typeof Highlight !== 'undefined';
}

export function clearHighlight(): void {
  if (highlightsSupported()) CSS.highlights.delete(HIGHLIGHT_NAME);
}

/**
 * Find `quote` on `pageEl`'s text layer; on success register the highlight and
 * scroll it into view; return 'found'/'miss'. Safe in jsdom / unsupported
 * browsers (highlight just isn't painted; the result still reflects the match).
 * A previously-registered highlight is always cleared first, even when the new
 * quote is not found (miss) — callers must not rely on a prior highlight persisting.
 */
export function highlightQuote(pageEl: HTMLElement, quote: string): 'found' | 'miss' {
  const textLayer = pageEl.querySelector<HTMLElement>('.textLayer');
  const range = textLayer ? findQuoteRange(textLayer, quote) : null;
  clearHighlight();
  if (!range) return 'miss';
  if (highlightsSupported()) CSS.highlights.set(HIGHLIGHT_NAME, new Highlight(range));
  range.startContainer.parentElement?.scrollIntoView?.({ block: 'center', behavior: 'smooth' });
  return 'found';
}

/** Re-centre the currently-registered citation highlight (the "Jump to ¶" action). No-op if none/unsupported. */
export function scrollCitedIntoView(): void {
  if (!highlightsSupported()) return;
  const hl = CSS.highlights.get(HIGHLIGHT_NAME);
  if (!hl) return;
  for (const range of hl) {
    (range as Range).startContainer.parentElement?.scrollIntoView?.({ block: 'center', behavior: 'smooth' });
    break;
  }
}
