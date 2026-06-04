<svelte:head><title>Trust & citations — About Donna</title></svelte:head>

<h1 class="mb-4 text-xl font-medium text-mlq-text">Trust & citations</h1>

<h2 class="mb-2 mt-6 text-sm font-medium uppercase tracking-wide text-mlq-muted">Citation pills</h2>

<p class="mb-3 max-w-prose text-sm leading-relaxed text-mlq-text">
  When Donna's answer is backed by documents in your knowledge base, numbered <strong>citation pills</strong>
  appear inline in the response text — one pill per supporting passage. Hovering or focusing a pill opens
  a small popover that shows the exact quoted text from the source, the filename, and the page number
  when the backend provides it.
</p>

<p class="mb-3 max-w-prose text-sm leading-relaxed text-mlq-text">
  The popover header is colour-coded to signal how confidently the passage was matched:
</p>

<ul class="mb-3 ml-4 list-disc space-y-1 text-sm text-mlq-text">
  <li><strong>Green — Verified.</strong> The passage was found in the source as an exact or normalised match.</li>
  <li><strong>Amber — Caveats.</strong> The source partially supports the claim, or the match was made by a paraphrase or ensemble judge rather than a direct text search.</li>
  <li><strong>Red — Unverified.</strong> The citation could not be confirmed against the source document.</li>
</ul>

<p class="mb-3 max-w-prose text-sm leading-relaxed text-mlq-text">
  Clicking a pill (or pressing <strong>Enter</strong> or <strong>Space</strong> when focused) opens the
  <strong>Document panel</strong> on the right side of the screen so you can read the full surrounding
  context in the source.
</p>

<h2 class="mb-2 mt-6 text-sm font-medium uppercase tracking-wide text-mlq-muted">Receipts</h2>

<p class="mb-3 max-w-prose text-sm leading-relaxed text-mlq-text">
  Every chat page has a <strong>Receipts</strong> button in the top-right corner. Opening it slides in
  a panel that lists every backend event recorded during the conversation — from your initial message,
  through any knowledge-base retrieval and model inference steps, to the final answer.
</p>

<p class="mb-3 max-w-prose text-sm leading-relaxed text-mlq-text">
  Each row is labelled by kind: <strong>message</strong>, <strong>retrieval</strong>,
  <strong>inference</strong>, <strong>skill</strong>, <strong>audit</strong>, or <strong>error</strong>.
  Retrieval rows show how many chunks were pulled and from how many knowledge bases. Inference rows
  show the model name, provider, token counts, and latency. Selecting <strong>Details</strong> on any
  row expands the raw event payload for deeper inspection.
</p>

<p class="mb-3 max-w-prose text-sm leading-relaxed text-mlq-text">
  You can filter the list by kind using the chips at the top of the drawer, and export the full event
  log as a JSONL file with the <strong>Export</strong> link in the drawer header.
</p>

<h2 class="mb-2 mt-6 text-sm font-medium uppercase tracking-wide text-mlq-muted">Anonymization indicator</h2>

<p class="mb-3 max-w-prose text-sm leading-relaxed text-mlq-text">
  When a cloud model is used, your prompt passes through an <strong>anonymization layer</strong> before
  it leaves your environment — identifiers are stripped at the edge. Donna surfaces this as an
  <strong>Anonymized</strong> badge (with a shield-check icon) that appears beside the answer whenever
  the backend confirms that anonymization was applied to that inference call.
</p>

<p class="mb-3 max-w-prose text-sm leading-relaxed text-mlq-text">
  The same signal appears inside the Receipts drawer: each inference row shows either
  <strong>Anonymized</strong> (green) or <strong>No anonymization</strong> (grey) depending on what
  the backend recorded for that event. Local models, which run entirely on-device, do not send data
  outbound at all and therefore do not carry this indicator.
</p>

<h2 class="mb-2 mt-6 text-sm font-medium uppercase tracking-wide text-mlq-muted">Standing disclaimer</h2>

<p class="mb-3 max-w-prose text-sm leading-relaxed text-mlq-text">
  Every chat page and the landing composer both display the notice:
  <strong>"AI can make mistakes. Answers are not legal advice."</strong> This reflects a core design
  principle of Donna: the system surfaces sources and verification signals so you can judge the answer
  yourself — it does not replace the professional judgement of a qualified lawyer. Always verify
  critical information against the underlying documents before acting on it.
</p>
