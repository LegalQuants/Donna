import { describe, it, expect } from 'vitest';
import { transformCitations, hasCitationMarkers } from './transform';
import type { Citation } from './types';

const cite = (over: Partial<Citation>): Citation => ({
  id: 'c', source_file_id: 'f', source_text: 's', partial: false, verified: true,
  verification_method: 'exact_match', ...over
});

describe('hasCitationMarkers', () => {
  it('detects markers', () => {
    expect(hasCitationMarkers('foo "bar" (Source: [1]).')).toBe(true);
    expect(hasCitationMarkers('no markers here')).toBe(false);
  });
});

describe('transformCitations', () => {
  it('wraps the quote and converts the marker, colored by state', () => {
    const html = '<p>The term is "thirty days" (Source: [1]).</p>';
    const out = transformCitations(html, [cite({ verification_method: 'exact_match' })]);
    expect(out).toContain('cite-quote cite-verified');
    expect(out).toContain('data-cite-index="1"');
    expect(out).toContain('cite-tab cite-verified');
    expect(out).not.toContain('(Source: [1])');
  });

  it('uses caveats (yellow) for paraphrase and unverified (red) for missing', () => {
    const html = '<p>a "x" (Source: [1]) and b "y" (Source: [2]).</p>';
    const out = transformCitations(html, [cite({ verification_method: 'paraphrase_judge' })]);
    expect(out).toContain('cite-tab cite-caveats'); // [1]
    expect(out).toContain('cite-tab cite-unverified'); // [2] out of range
  });

  it('does NOT convert a marker that appears inside a tag/attribute', () => {
    const html = '<a href="/x?q=(Source:%20[1])">link</a> "q" (Source: [1])';
    const out = transformCitations(html, [cite({})]);
    // the href is untouched; only the text marker becomes a tab
    expect(out).toContain('href="/x?q=(Source:%20[1])"');
    expect((out.match(/data-cite-index="1"/g) || []).length).toBe(1);
  });

  it('falls back to a marker-only tab when the quote is split by inline markup', () => {
    const html = '<p>see <em>"the clause"</em> (Source: [1]).</p>';
    const out = transformCitations(html, [cite({})]);
    expect(out).toContain('data-cite-index="1"'); // tab present
    expect(out).not.toContain('cite-quote'); // quote not underlined (split)
  });

  it('passes through content with no markers unchanged', () => {
    const html = '<p>nothing to cite</p>';
    expect(transformCitations(html, [])).toBe(html);
  });

  it('treats (Source: [0]) as unverified (no citations[-1])', () => {
    const out = transformCitations('<p>"x" (Source: [0]).</p>', [cite({})]);
    expect(out).toContain('cite-tab cite-unverified');
  });

  it('handles repeated indices', () => {
    const html = '<p>"a" (Source: [1]) then "b" (Source: [1])</p>';
    const out = transformCitations(html, [cite({})]);
    expect((out.match(/data-cite-index="1"/g) || []).length).toBe(2);
  });
});
