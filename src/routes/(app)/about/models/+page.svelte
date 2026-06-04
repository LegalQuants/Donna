<svelte:head><title>Models — About Donna</title></svelte:head>

<h1 class="mb-4 text-xl font-medium text-mlq-text">Models</h1>

<h2 class="mb-2 mt-6 text-sm font-medium uppercase tracking-wide text-mlq-muted">Choosing a model per message</h2>

<p class="mb-3 max-w-prose text-sm leading-relaxed text-mlq-text">
  Every message you send uses a model alias — a named routing slot that the backend resolves to a
  concrete model at request time. You choose your alias in the composer's model picker before
  sending. The picker shows only chat-capable aliases; embedding and other non-chat model types are
  filtered out automatically.
</p>

<p class="mb-3 max-w-prose text-sm leading-relaxed text-mlq-text">
  The two most common aliases you will see are:
</p>

<ul class="mb-3 ml-4 list-disc space-y-1 text-sm text-mlq-text">
  <li><strong>smart</strong> — routes to the highest-capability cloud model currently configured. Choose this when quality and depth matter more than speed.</li>
  <li><strong>fast</strong> (or other lower-tier aliases) — routes to a faster, lighter model. Useful for quick drafts, summaries, or when you want lower latency.</li>
</ul>

<p class="mb-3 max-w-prose text-sm leading-relaxed text-mlq-text">
  The picker also surfaces any installed local models (served via Ollama). Local aliases are
  labelled <strong>Local</strong> in the picker. They run on-device and never send data to a
  cloud provider, making them a good choice for sensitive or offline work.
</p>

<p class="mb-3 max-w-prose text-sm leading-relaxed text-mlq-text">
  Some matters enforce a minimum inference tier. When you open a matter that requires a higher-tier
  model than your current selection, Donna automatically promotes your choice to a model that
  satisfies the floor — preferring <strong>smart</strong> when it qualifies, otherwise the
  highest-tier option available — so you never accidentally send a message with an underpowered model.
</p>

<h2 class="mb-2 mt-6 text-sm font-medium uppercase tracking-wide text-mlq-muted">Settings → Models</h2>

<p class="mb-3 max-w-prose text-sm leading-relaxed text-mlq-text">
  Workspace-level model routing is managed in <strong>Settings → Models</strong>, reachable from
  the sidebar. The page has three sections.
</p>

<h2 class="mb-2 mt-6 text-sm font-medium uppercase tracking-wide text-mlq-muted">Inference categories</h2>

<p class="mb-3 max-w-prose text-sm leading-relaxed text-mlq-text">
  The <strong>Inference categories</strong> section lists every named alias in the system. Each row
  shows the category name, whether it is backed by a cloud or local model, and its current backing
  model label.
</p>

<ul class="mb-3 ml-4 list-disc space-y-1 text-sm text-mlq-text">
  <li><strong>Admins</strong> see a drop-down on every row and can reassign a category to any available cloud or local model. Changes take effect immediately — the row shows <strong>Saving…</strong> while the request is in flight and <strong>Saved</strong> on success.</li>
  <li><strong>Non-admins</strong> see the current backing model for each category but cannot change it. A note at the bottom of the section explains that changing model routing requires an admin account.</li>
</ul>

<h2 class="mb-2 mt-6 text-sm font-medium uppercase tracking-wide text-mlq-muted">Installed local models</h2>

<p class="mb-3 max-w-prose text-sm leading-relaxed text-mlq-text">
  The <strong>Installed local models</strong> card lists every Ollama model detected on your
  system, showing the model's label and its full identifier. If no local models are found, the card
  explains how to install Ollama and pull a model with <code>ollama pull &lt;model&gt;</code>.
  Adding a new model via Ollama and reloading the page is all that is needed for it to appear here
  and become selectable in the composer.
</p>

<h2 class="mb-2 mt-6 text-sm font-medium uppercase tracking-wide text-mlq-muted">Provider keys</h2>

<p class="mb-3 max-w-prose text-sm leading-relaxed text-mlq-text">
  Provider API keys (for Anthropic, OpenAI, and others) are configured at the deployment level via
  environment variables — they are not entered or edited in the Donna UI. If you need to rotate or
  add a provider key, contact whoever manages your Donna deployment.
</p>
