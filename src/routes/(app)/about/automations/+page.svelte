<svelte:head><title>Automations — About Donna</title></svelte:head>

<h1 class="mb-4 text-xl font-medium text-mlq-text">Automations</h1>

<p class="mb-3 max-w-prose text-sm leading-relaxed text-mlq-text">
  Automations let Donna run work on its own — a playbook or a skill executed against a knowledge
  base in the background, on demand or on a schedule. Every run leaves a full transparency receipt:
  what the agent did, what it cost, why it stopped, and what it produced.
</p>

<h2 class="mb-2 mt-6 text-sm font-medium uppercase tracking-wide text-mlq-muted">Turning automations on</h2>

<p class="mb-3 max-w-prose text-sm leading-relaxed text-mlq-text">
  Automations are off by default. Enable them with the <strong>Automations</strong> toggle in
  <strong>Settings → Preferences</strong>. Until then, automation pages show an inline
  <strong>Automations are off</strong> notice with an enable button, so you can opt in right where
  you need it.
</p>

<h2 class="mb-2 mt-6 text-sm font-medium uppercase tracking-wide text-mlq-muted">Where to find it</h2>

<p class="mb-3 max-w-prose text-sm leading-relaxed text-mlq-text">
  Automations is the fourth tab of the <strong>Workflows</strong> hub, alongside Skills, Playbooks,
  and Prompts. Inside it, four views cover the lifecycle: <strong>Sessions</strong> (every run, past
  and live), <strong>Schedules</strong>, <strong>Watches</strong>, and <strong>Notifications</strong>.
</p>

<h2 class="mb-2 mt-6 text-sm font-medium uppercase tracking-wide text-mlq-muted">Starting a run now</h2>

<p class="mb-3 max-w-prose text-sm leading-relaxed text-mlq-text">
  Press <strong>Run now</strong> to start a one-off session. Choose what to run — a
  <strong>playbook</strong> or a <strong>skill</strong> — then pick the <strong>knowledge base</strong>
  the run works against (required), optionally link a <strong>matter</strong>, and optionally set a
  <strong>cost cap</strong> in USD. Donna starts immediately and takes you to the live receipt.
</p>

<h2 class="mb-2 mt-6 text-sm font-medium uppercase tracking-wide text-mlq-muted">Schedules and watches</h2>

<ul class="mb-3 ml-4 list-disc space-y-1 text-sm text-mlq-text">
  <li><strong>Schedules</strong> run the same configuration on a recurring timer. You describe the cadence with a cron expression — the form previews it in plain language before you save.</li>
  <li><strong>Watches</strong> trigger a run automatically when new documents arrive in a knowledge base — useful for reviewing incoming material without checking manually.</li>
</ul>

<p class="mb-3 max-w-prose text-sm leading-relaxed text-mlq-text">
  Both are editable after creation — including reassigning or unlinking the matter — and both accept
  a per-run cost cap.
</p>

<h2 class="mb-2 mt-6 text-sm font-medium uppercase tracking-wide text-mlq-muted">Receipts: what the agent did</h2>

<p class="mb-3 max-w-prose text-sm leading-relaxed text-mlq-text">
  Open any session to see its receipt. The header shows the run's status, its source, total cost,
  and — for finished runs — why it stopped. The <strong>Activity</strong> timeline below lists every
  phase the run moved through and every tool call it made, in order. While a run is live the page
  updates automatically every few seconds.
</p>

<h2 class="mb-2 mt-6 text-sm font-medium uppercase tracking-wide text-mlq-muted">Results: what the run produced</h2>

<p class="mb-3 max-w-prose text-sm leading-relaxed text-mlq-text">
  The <strong>Results</strong> section shows the run's work product: its findings, in the order the
  run produced them, each with a severity badge and a severity summary up top. A run can also
  propose <strong>memories</strong> — durable notes it suggests keeping — listed under
  <strong>Memories this run proposed</strong>. Results stream in live while the run works.
</p>

<h2 class="mb-2 mt-6 text-sm font-medium uppercase tracking-wide text-mlq-muted">Notifications</h2>

<p class="mb-3 max-w-prose text-sm leading-relaxed text-mlq-text">
  When a run finishes, it posts to the <strong>Notifications</strong> view — title, summary, and a
  link straight to the session's receipt. Unread notifications carry a dot; <strong>Mark read</strong>
  clears them one at a time.
</p>

<h2 class="mb-2 mt-6 text-sm font-medium uppercase tracking-wide text-mlq-muted">Cost caps</h2>

<p class="mb-3 max-w-prose text-sm leading-relaxed text-mlq-text">
  Every way of starting a run — run now, schedules, watches — accepts an optional cost cap in USD.
  A run that reaches its cap stops, and the receipt records that as the terminal reason. Combined
  with receipts and notifications, you always know what ran, what it cost, and what it produced.
</p>
