import { describe, it, expect, afterEach } from 'vitest';
import { findQuoteRange, highlightQuote, scrollCitedIntoView, clearHighlight } from './pdfHighlight';

afterEach(() => { document.body.innerHTML = ''; });

// Build a synthetic PDF.js-style text layer: one <span> per text run.
function layer(...runs: string[]): HTMLElement {
  const el = document.createElement('div');
  el.className = 'textLayer';
  for (const r of runs) {
    const span = document.createElement('span');
    span.textContent = r;
    el.appendChild(span);
  }
  document.body.appendChild(el); // ranges need nodes in a document
  return el;
}
function page(...runs: string[]): HTMLElement {
  const p = document.createElement('div');
  p.className = 'pdf-page';
  p.dataset.pageNumber = '1';
  p.appendChild(layer(...runs));
  document.body.appendChild(p);
  return p;
}

describe('findQuoteRange', () => {
  it('matches a quote that spans multiple text-layer spans', () => {
    const tl = layer('This Agreement may be ', 'terminated by either party.');
    const range = findQuoteRange(tl, 'Agreement may be terminated by either');
    expect(range).not.toBeNull();
    expect(range!.toString()).toBe('Agreement may be terminated by either');
  });

  it('collapses whitespace differences between quote and text layer', () => {
    const tl = layer('foo   bar baz');
    const range = findQuoteRange(tl, 'foo bar');
    expect(range).not.toBeNull();
    expect(range!.toString()).toMatch(/^foo\s+bar$/);
  });

  it('folds ligatures via NFKC (ﬁ matches "fi")', () => {
    const tl = layer('the ﬁrst clause'); // ﬁ = U+FB01
    const range = findQuoteRange(tl, 'first');
    expect(range).not.toBeNull();
    expect(range!.toString()).toBe('ﬁrst');
  });

  it('ignores soft hyphens in the source text', () => {
    const tl = layer('inter­national law'); // soft hyphen inside the word
    const range = findQuoteRange(tl, 'international');
    expect(range).not.toBeNull();
  });

  it('returns null on a genuine content mismatch', () => {
    const tl = layer('totally unrelated wording here');
    expect(findQuoteRange(tl, 'nonexistent clause')).toBeNull();
  });

  it('returns null for an empty quote', () => {
    const tl = layer('anything');
    expect(findQuoteRange(tl, '   ')).toBeNull();
  });

  it('handles an astral-plane character at the match boundary without throwing', () => {
    const tl = layer('alpha 𝐀 omega'); // 𝐀 = U+1D400, a surrogate pair
    const range = findQuoteRange(tl, 'alpha 𝐀');
    expect(range).not.toBeNull();
    expect(range!.toString()).toBe('alpha 𝐀');
  });
});

describe('highlightQuote', () => {
  it('returns "found" when the quote is located (CSS.highlights absent in jsdom is fine)', () => {
    const p = page('This Agreement may be terminated by either party.');
    expect(highlightQuote(p, 'terminated by either')).toBe('found');
  });

  it('returns "miss" when the quote is not on the page', () => {
    const p = page('Some other text entirely.');
    expect(highlightQuote(p, 'not present')).toBe('miss');
  });

  it('returns "miss" when the page has no text layer', () => {
    const p = document.createElement('div');
    p.className = 'pdf-page';
    expect(highlightQuote(p, 'anything')).toBe('miss');
  });
});

describe('scrollCitedIntoView', () => {
  it('does not throw when there is no highlight / unsupported environment (jsdom)', () => {
    expect(() => scrollCitedIntoView()).not.toThrow();
  });
});

describe('clearHighlight', () => {
  it('does not throw in jsdom (CSS.highlights absent)', () => {
    expect(() => clearHighlight()).not.toThrow();
  });
});
