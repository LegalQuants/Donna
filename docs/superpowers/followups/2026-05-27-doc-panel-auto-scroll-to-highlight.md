# Follow-up: Document panel — auto-scroll to the highlighted citation on open

**Filed:** 2026-05-27 (during P4-3 brainstorm, observed by user) · **Origin:** P3-2 + P3-3.

## What the user sees

When a citation pill is clicked and the document panel opens, the PDF renders at the **top of the document** (page 1 title), not at the cited passage — even though the cited-passage bar at the top of the panel already shows the verbatim quote with a "Jump to ¶" button. The user has to click "Jump to ¶" _every_ time to actually see the quote in context. On long PDFs the highlighted span is far off-screen.

Verified visually 2026-05-27 against the live stack: opening a citation in `tests/citation-highlight.spec.ts`-style flow lands the panel scrolled to the PDF top; the highlighted span sits at the very bottom of the viewport (or completely off-screen on smaller windows).

## Why it happens

P3-2 introduced `scrollCitedIntoView` (in `src/lib/docpanel/`) and wired it to the "Jump to ¶" button in the cited-passage bar — but it is **not** automatically invoked when the panel opens or when the highlight successfully lands on the rendered PDF. The intent in P3-2 was to make jump explicit; in practice the panel-on-open state is unusable without it.

The relevant pieces (from `donna-phase-status` memory + the P3-2 commit train):

- `pdfHighlight.ts` paints the highlight via the CSS Custom Highlight API.
- `PdfViewer.svelte` runs the highlight `$effect` keyed on `{page, quote}` and reports found/miss to `docPanel.setHighlightStatus(...)`.
- `DocumentPanel.svelte` cited-passage bar exposes the manual "Jump to ¶" button calling `scrollCitedIntoView`.

## Proposed fix (small slice)

When `docPanel.setHighlightStatus('found' /* or whatever the success value is */)` fires after the citation-driven open, also invoke `scrollCitedIntoView` once — but only on first land per `{tab, page, quote}`, so subsequent user scrolling isn't fought by re-jumps. The amber "miss" state should continue to not auto-scroll (there's nothing to scroll to).

Keep the manual "Jump to ¶" button for explicit re-jumps after the user has scrolled away.

## Test sketch

- Unit (`pdfHighlight` is jsdom-friendly per P3-2 memory): on a controller that records the call, simulate `setHighlightStatus('found')` and assert `scrollCitedIntoView` was invoked exactly once.
- Live e2e (extend `tests/citation-highlight.spec.ts`): after the citation pill is clicked, assert the highlighted DOM range is within the panel's `clientHeight` (i.e., visible without manual scroll).

## Sequencing

Not blocking P4-3a (matter files / skills / context / KB linking). Two reasonable orderings:

1. **Fix-it-now slice** (tiny PR before P4-3a) — auto-scroll fix only, ~30 minutes including the test.
2. **After P4-3a** — fold into a small P3-polish slice along with the `tablist` + keyboard nav that's already deferred (per `donna-phase-status` "P3 polish backlog").

User flagged the issue during P4-3a brainstorm. Defer the decision to the user.
