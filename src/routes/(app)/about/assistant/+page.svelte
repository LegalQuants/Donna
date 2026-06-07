<svelte:head><title>Assistant — About Donna</title></svelte:head>

<h1 class="mb-4 text-xl font-medium text-mlq-text">The Assistant</h1>

<h2 class="mb-2 mt-6 text-sm font-medium uppercase tracking-wide text-mlq-muted">Starting a conversation</h2>

<p class="mb-3 max-w-prose text-sm leading-relaxed text-mlq-text">
  The <strong>Assistant</strong> is Donna's core interface. When you open the app you land on a
  central composer — a single input field that greets you by name. Type your question or task there
  and press <strong>Enter</strong> (or the send arrow) to start a new chat. Donna streams the answer
  back in real time and the conversation moves into its own chat page, where you can continue
  sending follow-up messages using the composer at the bottom of the screen.
</p>

<p class="mb-3 max-w-prose text-sm leading-relaxed text-mlq-text">
  Every chat lives at its own URL, so you can bookmark it, share the link internally, or return to
  it later from the sidebar's chat history. Within a chat the full message thread is preserved and
  the composer stays ready at the bottom for follow-up turns.
</p>

<h2 class="mb-2 mt-6 text-sm font-medium uppercase tracking-wide text-mlq-muted">✦ Enhance — rewriting a vague draft</h2>

<p class="mb-3 max-w-prose text-sm leading-relaxed text-mlq-text">
  The <strong>Enhance</strong> button (the sparkle icon labelled <strong>Enhance</strong> in the
  composer toolbar) takes what you have typed so far and rewrites it into a fuller, more precise
  prompt before you send it. It is particularly useful when you have a rough idea but are not sure
  how to phrase it for best results.
</p>

<p class="mb-3 max-w-prose text-sm leading-relaxed text-mlq-text">
  The flow is three steps:
</p>

<ul class="mb-3 ml-4 list-disc space-y-1 text-sm text-mlq-text">
  <li><strong>Run</strong> — click <strong>Enhance</strong>. The button briefly shows "Enhancing…" with a cancel option while the backend rewrites your draft.</li>
  <li><strong>Preview</strong> — a preview card appears above the text box showing the expanded prompt and, optionally, a collapsible "Why these changes" list explaining each edit.</li>
  <li><strong>Accept or discard</strong> — click <strong>Use this</strong> to replace the text in the composer with the enhanced version, or <strong>Discard</strong> to go back to your original draft. Neither action sends the message; you can still edit before hitting send.</li>
</ul>

<p class="mb-3 max-w-prose text-sm leading-relaxed text-mlq-text">
  If the backend finds nothing to improve it shows a brief "No changes suggested" note and the
  composer is unchanged. Enhance is context-aware: if you have skills attached to the message,
  those skill names are sent along so the rewrite can take your chosen workflow into account.
</p>

<h2 class="mb-2 mt-6 text-sm font-medium uppercase tracking-wide text-mlq-muted">Attaching skills</h2>

<p class="mb-3 max-w-prose text-sm leading-relaxed text-mlq-text">
  Skills are structured workflows that guide Donna's response — for example, a contract review
  checklist or a clause extraction routine. To attach one, click the <strong>Skill</strong> button
  (a + icon) in the composer toolbar. A small search panel opens; type a keyword to find skills by name or
  description and click the skill you want to add.
</p>

<p class="mb-3 max-w-prose text-sm leading-relaxed text-mlq-text">
  Attached skills appear as pill badges inside the composer. Some skills expose required or optional
  input fields — those appear inline between the pills and the text area so you can fill them in
  before sending. Required fields must be filled before the send button becomes active. Remove a
  skill at any time by clicking the <strong>×</strong> on its pill. You can attach more than one
  skill to a single message; each is sent alongside your prompt.
</p>

<h2 class="mb-2 mt-6 text-sm font-medium uppercase tracking-wide text-mlq-muted">Attaching files</h2>

<p class="mb-3 max-w-prose text-sm leading-relaxed text-mlq-text">
  To ground an answer in a specific document, click the <strong>paperclip</strong> button in the
  toolbar or drag a file directly onto the composer. You can attach up to <strong>16 files per
  message</strong>. Each file appears as a pill showing the filename and its upload status
  ("uploading" → "pending" → "processing" → "ready", or "failed"). The send button stays disabled
  until every attached file has finished processing — a failed file must be removed before you can
  send. Remove any file at any
  time with the <strong>×</strong> on its pill.
</p>

<p class="mb-3 max-w-prose text-sm leading-relaxed text-mlq-text">
  Files attached to a message are sent to the backend alongside your text and are available to the
  model for that turn. If you need to make a document available across many chats, upload it to a
  project's knowledge base instead — see the <strong>Knowledge</strong> page of this guide for
  details.
</p>

<h2 class="mb-2 mt-6 text-sm font-medium uppercase tracking-wide text-mlq-muted">Saved prompts</h2>

<p class="mb-3 max-w-prose text-sm leading-relaxed text-mlq-text">
  The <strong>Prompts</strong> button (bookmark icon) opens your saved prompt library. Click a saved
  prompt to insert its text at the cursor position in the composer — it splices in without
  overwriting what you have already typed. You can also save the current draft directly from the
  panel: click <strong>+ Save current draft as a prompt</strong>, give it a name and optional tags,
  and save it for future reuse.
</p>

<h2 class="mb-2 mt-6 text-sm font-medium uppercase tracking-wide text-mlq-muted">Choosing a model</h2>

<p class="mb-3 max-w-prose text-sm leading-relaxed text-mlq-text">
  The model picker in the composer toolbar shows the currently selected alias (for example
  <strong>smart</strong>) alongside the resolved model it maps to (for example "Opus 4.7"). Click it
  to open a menu grouped into <strong>Cloud</strong> and <strong>Local</strong> sections. Choose any
  model for the next message; your selection persists across turns in the same browser session.
</p>

<p class="mb-3 max-w-prose text-sm leading-relaxed text-mlq-text">
  When a chat is scoped to a project that requires a minimum capability tier, lower-tier models
  appear greyed out in the picker and cannot be selected. Donna automatically promotes your chosen
  model to the floor tier in that case so the answer meets the project's quality requirements. The
  <strong>Models</strong> page of this guide explains tiers, cloud vs. local routing, and how to
  configure model preferences in Settings.
</p>

<h2 class="mb-2 mt-6 text-sm font-medium uppercase tracking-wide text-mlq-muted">Reading the answer: citations</h2>

<p class="mb-3 max-w-prose text-sm leading-relaxed text-mlq-text">
  When Donna's answer draws on documents in a knowledge base or on files you attached, it embeds
  numbered citation pills inline in the text — small superscript markers like ¹ or ². Hover a pill
  to see a popover with the source text excerpt, the document filename, and the page number if
  available. The popover header is colour-coded: green for verified citations, amber for those with
  caveats, and red for citations that could not be matched to a source.
</p>

<p class="mb-3 max-w-prose text-sm leading-relaxed text-mlq-text">
  Click a citation pill (or press Enter/Space when it is focused) to open the
  <strong>Document panel</strong> on the right side of the chat, which shows the full source
  document with the cited passage highlighted. This lets you read the answer and its source side by
  side without leaving the chat. The <strong>Trust &amp; citations</strong> page of this guide
  explains how citations are verified and what each colour state means.
</p>

<h2 class="mb-2 mt-6 text-sm font-medium uppercase tracking-wide text-mlq-muted">Receipts drawer</h2>

<p class="mb-3 max-w-prose text-sm leading-relaxed text-mlq-text">
  Every chat exposes a <strong>Receipts</strong> button in the top-right corner of the chat header.
  Click it to open the receipts drawer, which lists every backend event that occurred during the
  conversation — retrieval steps, skill invocations, model calls, and more — in chronological order.
  Use the kind-filter chips at the top of the drawer to show or hide event categories. You can also
  export the full event log as a JSONL file via the <strong>Export</strong> link in the drawer
  header, useful for debugging or auditing a response.
</p>
