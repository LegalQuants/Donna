<svelte:head><title>Tabular — About Donna</title></svelte:head>

<h1 class="mb-4 text-xl font-medium text-mlq-text">Tabular review</h1>

<h2 class="mb-2 mt-6 text-sm font-medium uppercase tracking-wide text-mlq-muted">What it is</h2>
<p class="mb-3 max-w-prose text-sm leading-relaxed text-mlq-text">
  Tabular review runs the same set of questions across many documents at once and returns the answers in a cited grid — one row per document, one column per question. Use it when you need to compare how different agreements, filings, or contracts answer the same question, or when you want to extract structured facts from a large document set without reading each file individually.
</p>
<p class="mb-3 max-w-prose text-sm leading-relaxed text-mlq-text">
  Each cell in the grid carries a confidence signal (<strong>high</strong>, <strong>medium</strong>, or <strong>low</strong>) and links to the source passage in the original document. You can export the finished grid to Excel or CSV for use outside Donna.
</p>

<h2 class="mb-2 mt-6 text-sm font-medium uppercase tracking-wide text-mlq-muted">Starting a new review</h2>
<p class="mb-3 max-w-prose text-sm leading-relaxed text-mlq-text">
  Open <strong>Tabular</strong> in the sidebar, then click <strong>New review</strong>. The builder page is split into two panels: <strong>Documents</strong> on the left and <strong>Columns</strong> on the right.
</p>
<p class="mb-3 max-w-prose text-sm leading-relaxed text-mlq-text">
  To add documents, switch between the <strong>From a matter</strong> and <strong>Upload</strong> tabs. When using a matter, pick the matter from the dropdown and check each file you want to include. When uploading, drag files onto the drop zone; they are ingested immediately and added to the selection as they finish processing. Selected documents appear as removable chips below the picker.
</p>

<h2 class="mb-2 mt-6 text-sm font-medium uppercase tracking-wide text-mlq-muted">Defining columns</h2>
<p class="mb-3 max-w-prose text-sm leading-relaxed text-mlq-text">
  The <strong>Columns</strong> panel offers two modes, toggled with the <strong>Define columns / Use a table skill</strong> control:
</p>
<ul class="mb-3 ml-4 list-disc space-y-1 text-sm text-mlq-text">
  <li>
    <strong>Define columns</strong> — build your own grid ad hoc. Each column has a <strong>Column name</strong> (the heading that appears in the grid) and a <strong>Column question</strong> (what Donna should extract, e.g. "Which state's law governs?"). Use the arrow buttons to reorder columns and the × button to remove one. Click <strong>Add column</strong> to add more. Column names must be unique.
  </li>
  <li>
    <strong>Use a table skill</strong> — pick a pre-built table skill from the list. The skill defines the columns; you cannot edit them here. The exact column count and estimated cost appear in the cost preview before you commit.
  </li>
</ul>
<p class="mb-3 max-w-prose text-sm leading-relaxed text-mlq-text">
  When defining columns manually, each column also has an optional <strong>Min. model tier</strong> setting (tiers 1–5, or none). Setting a minimum tier tells Donna to use at least that capability level when answering that column's question. Leave it at <strong>None</strong> to let the system choose automatically. Higher tiers may increase the estimated cost.
</p>
<p class="mb-3 max-w-prose text-sm leading-relaxed text-mlq-text">
  Each manually-defined column also has an <strong>Ensemble verification</strong> checkbox. When
  enabled, the answers in that column are independently cross-checked before being accepted, and
  when you open one of a verified cell's citations, the source view shows a green <strong>✓ Verified</strong> chip.
  Ensemble-verified cells cost more; the cost preview shows the count of ensemble-verified cells
  and the premium as a separate line.
</p>

<h2 class="mb-2 mt-6 text-sm font-medium uppercase tracking-wide text-mlq-muted">Running the review</h2>
<p class="mb-3 max-w-prose text-sm leading-relaxed text-mlq-text">
  The status bar at the bottom of the builder shows the current scope — for example <strong>4 docs × 3 cols = 12 cells</strong> — so you can gauge the size of the run before committing. When you are ready, click <strong>Preview cost</strong>.
</p>
<p class="mb-3 max-w-prose text-sm leading-relaxed text-mlq-text">
  A cost preview modal appears, showing the total cell count and an estimated cost in USD broken down by model tier. The estimate is approximate. Click <strong>Run review</strong> to start, or <strong>Cancel</strong> (or press Escape) to go back and adjust the setup.
</p>
<p class="mb-3 max-w-prose text-sm leading-relaxed text-mlq-text">
  Once started, the review runs in the background. The grid page opens automatically and shows a live progress indicator while cells are being processed. If a run takes longer than expected, a note appears suggesting you reload to check again. You can click <strong>Cancel</strong> on the running review page to stop it early.
</p>

<h2 class="mb-2 mt-6 text-sm font-medium uppercase tracking-wide text-mlq-muted">Reading the grid</h2>
<p class="mb-3 max-w-prose text-sm leading-relaxed text-mlq-text">
  When the review completes, the grid shows one row per document and one column per question. Each cell displays a coloured dot indicating confidence — green for high, amber for medium, red for low, and grey for a failed cell — followed by a short excerpt of the answer. A number on the right edge of a cell indicates how many source citations back the answer.
</p>
<p class="mb-3 max-w-prose text-sm leading-relaxed text-mlq-text">
  A summary line above the grid shows the total cell count and how many cells failed. If any cell shows <strong>(failed)</strong>, the cell detail panel (see below) will display the error reason when available.
</p>

<h2 class="mb-2 mt-6 text-sm font-medium uppercase tracking-wide text-mlq-muted">Navigating from a cell to its source</h2>
<p class="mb-3 max-w-prose text-sm leading-relaxed text-mlq-text">
  Click any cell to open the <strong>cell detail panel</strong> — a slide-in drawer on the right side of the screen. The panel shows the full answer text, the confidence level, and a list of citations. Each citation is a button labelled <strong>Source · p.N</strong>, with a short preview of the supporting passage below it.
</p>
<p class="mb-3 max-w-prose text-sm leading-relaxed text-mlq-text">
  Clicking a citation opens the <strong>document panel</strong> — the same viewer used elsewhere in Donna — which loads the source document and jumps to the cited page and passage, with a green <strong>✓ Verified</strong> chip when the cell was ensemble-verified. Press Escape or click the × button to close the cell detail panel.
</p>

<h2 class="mb-2 mt-6 text-sm font-medium uppercase tracking-wide text-mlq-muted">Exporting results</h2>
<p class="mb-3 max-w-prose text-sm leading-relaxed text-mlq-text">
  On any completed review, click the <strong>Export ▾</strong> button at the top right of the grid and choose <strong>Excel (.xlsx)</strong> or <strong>CSV (.csv)</strong>. The file downloads immediately.
</p>

<h2 class="mb-2 mt-6 text-sm font-medium uppercase tracking-wide text-mlq-muted">History and resuming past reviews</h2>
<p class="mb-3 max-w-prose text-sm leading-relaxed text-mlq-text">
  All past and in-progress reviews are listed on the <strong>Tabular</strong> index page. Each row shows the run's status (completed, running, pending, failed, or cancelled), the number of documents and columns, an estimated cost if available, and the date the review was created. Click any row to open that review's grid — completed reviews show their full results immediately, while still-running reviews continue polling for updates in the background.
</p>
