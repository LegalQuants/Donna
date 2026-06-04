<svelte:head><title>How to Build — Powered by LQ-AI — About Donna</title></svelte:head>

<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- back to how-it-works -->
<a href="/about/lq-ai" class="mb-4 inline-block text-sm text-mlq-strong hover:underline">← How it works</a>

<h1 class="mb-4 text-xl font-medium text-mlq-text">Powered by LQ-AI — How to Build</h1>

<p class="mb-6 max-w-prose text-sm leading-relaxed text-mlq-text">
  Everything you need to go from curious to contributor — whether you're a practicing attorney, a
  security engineer, or a developer looking for a well-scoped first PR.
</p>

<!-- 1: The contribution path -->
<h2 class="mb-2 mt-8 text-lg font-medium text-mlq-strong">The contribution path</h2>
<p class="mb-3 max-w-prose text-sm leading-relaxed text-mlq-text">
  Contributions arrive two ways: GitHub Issues for bug reports and feature requests; Pull Requests
  for code, skill, and documentation contributions. The engineering process — DCO sign-off,
  imperative-mood commit messages, PR template — is in
  <a href="https://github.com/LegalQuants/lq-ai/blob/main/CONTRIBUTING.md" target="_blank" rel="noopener noreferrer" class="text-mlq-strong hover:underline">CONTRIBUTING.md</a>.
  If you're picking up a curated mini-PRD (see below), the mini-PRD's "Definition of merged" section
  is the contract: if the acceptance criteria are checked off and the substance review passes, the PR
  merges. Ambiguities get resolved in writing on the issue thread before work begins — not during
  review.
</p>

<!-- 2: Skill contribution -->
<h2 class="mb-2 mt-8 text-lg font-medium text-mlq-strong">Want to contribute a skill? Start here.</h2>
<p class="mb-3 max-w-prose text-sm leading-relaxed text-mlq-text">
  Skills are the canonical artifact of value in LQ-AI (PRD §7.1). A skill is a structured SKILL.md
  file that captures: a system prompt, an input schema, reference documents, and at least one worked
  example that a practicing attorney can evaluate. Skills containing legal substance are not ordinary
  code contributions — they go through an attestation review to ensure accuracy.
</p>

<ol class="mb-4 space-y-2">
  <li class="flex gap-3 text-sm text-mlq-text">
    <span class="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-mlq-subtle text-xs font-medium text-mlq-strong">1</span>
    <span><strong>Claim.</strong> File a GitHub issue or comment on an open one. A maintainer acknowledges within ~7 days.</span>
  </li>
  <li class="flex gap-3 text-sm text-mlq-text">
    <span class="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-mlq-subtle text-xs font-medium text-mlq-strong">2</span>
    <span><strong>Draft.</strong> Author the SKILL.md, reference files, and at least one worked example. The Skill Format Explorer below validates structure as you write.</span>
  </li>
  <li class="flex gap-3 text-sm text-mlq-text">
    <span class="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-mlq-subtle text-xs font-medium text-mlq-strong">3</span>
    <span><strong>Attest.</strong> Add a practicing-attorney attestation paragraph to the PR description confirming the legal substance. Agents do not attest; the human contributor is the attesting party.</span>
  </li>
  <li class="flex gap-3 text-sm text-mlq-text">
    <span class="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-mlq-subtle text-xs font-medium text-mlq-strong">4</span>
    <span><strong>Review.</strong> A practicing attorney + an engineer review the PR. Both approvals required before merge.</span>
  </li>
</ol>

<p class="mb-2 max-w-prose text-sm leading-relaxed text-mlq-text">
  <a href="https://github.com/LegalQuants/lq-ai/blob/main/skills/CONTRIBUTING.md" target="_blank" rel="noopener noreferrer" class="text-mlq-strong hover:underline">skills/CONTRIBUTING.md</a>
  ·
  <a href="https://github.com/LegalQuants/lq-ai/blob/main/docs/skill-authoring-guide.md" target="_blank" rel="noopener noreferrer" class="text-mlq-strong hover:underline">docs/skill-authoring-guide.md</a>
  ·
  <a href="https://github.com/LegalQuants/lq-ai/blob/main/docs/contribute/mini-prds/skill-acceptance-tests.md" target="_blank" rel="noopener noreferrer" class="text-mlq-strong hover:underline">skill-acceptance-tests mini-PRD</a>
</p>

<p class="mb-2 max-w-prose text-sm leading-relaxed text-mlq-text">
  <strong>Try it out: Skill Format Explorer.</strong> Experiment with the SKILL.md format below; the
  validation rules mirror the live backend.
</p>
<iframe
  src="/learn/playgrounds/skill-format.html"
  title="Skill Format Explorer — SKILL.md editor and validation"
  loading="lazy"
  class="mt-1 h-[900px] w-full rounded-mlq-control border border-mlq-subtle"
></iframe>
<div class="mt-2 text-xs text-mlq-muted">
  <!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- external static playground -->
  <a href="/learn/playgrounds/skill-format.html" target="_blank" rel="noopener noreferrer" class="text-mlq-strong hover:underline">Open full-screen ↗</a>
</div>

<!-- 3: Curated mini-PRDs (condensed) -->
<h2 class="mb-2 mt-8 text-lg font-medium text-mlq-strong">Curated mini-PRDs</h2>
<p class="mb-3 max-w-prose text-sm leading-relaxed text-mlq-text">
  LQ-AI maintains a set of curated, shortest-path contributions — each with explicit acceptance
  criteria and a contributor profile, so you can start with the same information the maintainers
  have. The full list with effort estimates is at
  <a href="https://github.com/LegalQuants/lq-ai/blob/main/docs/contribute/EASIEST-CONTRIBUTIONS.md" target="_blank" rel="noopener noreferrer" class="text-mlq-strong hover:underline">docs/contribute/EASIEST-CONTRIBUTIONS.md</a>.
</p>

<!-- 4: Before you open a PR (condensed) -->
<h2 class="mb-2 mt-8 text-lg font-medium text-mlq-strong">Before you open a PR</h2>
<p class="mb-3 max-w-prose text-sm leading-relaxed text-mlq-text">
  Every PR must clear unit, integration, end-to-end, lint, type-check, and coverage gates, plus both
  a substance review and an engineering review — the full checklist is in
  <a href="https://github.com/LegalQuants/lq-ai/blob/main/CONTRIBUTING.md" target="_blank" rel="noopener noreferrer" class="text-mlq-strong hover:underline">CONTRIBUTING.md</a>.
  The two interactive maps below let you explore exactly what must pass and how to trace a change
  through the system.
</p>
<p class="mb-2 max-w-prose text-sm leading-relaxed text-mlq-text">
  <!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- external static playground -->
  <a href="/learn/playgrounds/test-landscape.html" target="_blank" rel="noopener noreferrer" class="text-mlq-strong hover:underline">Test landscape: what must pass ↗</a>
  ·
  <!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- external static playground -->
  <a href="/learn/playgrounds/otel-eval.html" target="_blank" rel="noopener noreferrer" class="text-mlq-strong hover:underline">Observability trace explorer ↗</a>
</p>

<!-- 5: Anatomy of an aligned agentic flow -->
<h2 class="mb-2 mt-8 text-lg font-medium text-mlq-strong">Anatomy of an aligned agentic flow (M4)</h2>
<p class="mb-3 max-w-prose text-sm leading-relaxed text-mlq-text">
  <strong>Shipped in M4.</strong> When you contribute an autonomous flow — a single agent that acts
  without a human approving each step — transparency moves from "you can read the prompt" to "you
  can audit the behavior." Four obligations make a flow aligned. The authoritative how-to is the
  <a href="https://github.com/LegalQuants/lq-ai/blob/main/docs/LQVern/agentic-flow-alignment-guide.md" target="_blank" rel="noopener noreferrer" class="text-mlq-strong hover:underline">agentic-flow-alignment-guide.md</a>;
  this is the condensed checklist.
</p>

<ol class="mb-4 space-y-2">
  <li class="flex gap-3 text-sm text-mlq-text">
    <span class="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-mlq-subtle text-xs font-medium text-mlq-strong">1</span>
    <span><strong>One chokepoint.</strong> Every tool call goes through the single <code>guarded_tool_call</code> chokepoint — no tool bypasses it. A new tool gets the brakes and telemetry for free and cannot route around them.</span>
  </li>
  <li class="flex gap-3 text-sm text-mlq-text">
    <span class="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-mlq-subtle text-xs font-medium text-mlq-strong">2</span>
    <span><strong>Brakes before the tool runs.</strong> R5 (halt-state read), R6 (phase-grant check), and R4 (cost-cap projection) are all checked <em>before</em> the tool executes — in that order.</span>
  </li>
  <li class="flex gap-3 text-sm text-mlq-text">
    <span class="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-mlq-subtle text-xs font-medium text-mlq-strong">3</span>
    <span><strong>Observable + audited, counts only.</strong> Emit the <code>autonomous.execute</code> + <code>autonomous.tool_call</code> spans and closed-enum audit rows (phase_transition / tool_call / halted / cost_cap_reached / completed). Attributes carry counts, types, IDs, and costs only — never raw entity values, document text, prompt bodies, or model responses.</span>
  </li>
  <li class="flex gap-3 text-sm text-mlq-text">
    <span class="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-mlq-subtle text-xs font-medium text-mlq-strong">4</span>
    <span><strong>A user-readable receipt.</strong> Every run produces a receipt that says what the agent did and why — every tool call, the inputs seen (counts/types/IDs), cost, phase, and gates passed — readable by the user, not just the operator.</span>
  </li>
</ol>

<p class="mb-3 max-w-prose text-sm leading-relaxed text-mlq-text">
  <a href="https://github.com/LegalQuants/lq-ai/blob/main/docs/LQVern/agentic-flow-alignment-guide.md" target="_blank" rel="noopener noreferrer" class="text-mlq-strong hover:underline">Building aligned agentic flows — the contributor guide ↗</a>
  ·
  <!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- external static playground -->
  <a href="/learn/playgrounds/autonomous-flow.html" target="_blank" rel="noopener noreferrer" class="text-mlq-strong hover:underline">Autonomous flow playground ↗</a>
</p>

<!-- 6: The roadmap -->
<h2 class="mb-2 mt-8 text-lg font-medium text-mlq-strong">The roadmap</h2>
<p class="mb-3 max-w-prose text-sm leading-relaxed text-mlq-text">
  LQ-AI follows a milestone-based roadmap. M1 shipped the foundation; M2 and M3 each added a named
  capability layer on top. M1, M2, M3, and the M4 Autonomous Layer are all shipped; the Contract
  Relationship graph remains deferred future work.
</p>

<ul class="mb-3 ml-4 list-disc space-y-1 text-sm text-mlq-text">
  <li><strong>M1 — Foundation.</strong> Self-hostable conversational AI on ten starter skills. Chat, matters, skills (capture / fork / author), knowledge bases, saved prompts, receipts, tier enforcement, audit log, GDPR export/deletion. Three provider adapters: Anthropic, OpenAI, Ollama.</li>
  <li><strong>M2 — Citation Engine + Anonymization Layer.</strong> Character-level citation verification and personal-data pseudonymization before inference, plus the Azure OpenAI provider adapter.</li>
  <li><strong>M3 — Capability surfaces + integrations.</strong> Playbooks, Tabular Review, Slack/Teams intake bridges, OpenTelemetry observability, and the Microsoft Word add-in (Office.js — plumbing only at v0.3.0; the in-pane feature surface is deferred).</li>
  <li><strong>M4 — Autonomous Layer.</strong> Multi-step agent execution with verifiable receipts (opt-in, off by default).</li>
  <li><strong>Future — Contract Relationship graph.</strong> Deferred future work — not yet built.</li>
</ul>

<p class="mb-3 max-w-prose text-sm leading-relaxed text-mlq-text">
  Full deferred-enhancement list with wire-format specs for contributor-ready items:
  <a href="https://github.com/LegalQuants/lq-ai/blob/main/docs/PRD.md#9-deferred-enhancements-and-identified-future-work" target="_blank" rel="noopener noreferrer" class="text-mlq-strong hover:underline">PRD §9</a>.
</p>

<!-- 7: GitHub -->
<h2 class="mb-2 mt-8 text-lg font-medium text-mlq-strong">GitHub</h2>
<p class="mb-3 max-w-prose text-sm leading-relaxed text-mlq-text">
  The full project lives at
  <a href="https://github.com/LegalQuants/lq-ai" target="_blank" rel="noopener noreferrer" class="text-mlq-strong hover:underline">github.com/LegalQuants/lq-ai</a>.
  Open bugs and feature requests in
  <a href="https://github.com/LegalQuants/lq-ai/issues" target="_blank" rel="noopener noreferrer" class="text-mlq-strong hover:underline">Issues</a>;
  active contributions are in
  <a href="https://github.com/LegalQuants/lq-ai/pulls" target="_blank" rel="noopener noreferrer" class="text-mlq-strong hover:underline">Pull Requests</a>.
  Vulnerabilities go through the responsible disclosure process in
  <a href="https://github.com/LegalQuants/lq-ai/blob/main/SECURITY.md" target="_blank" rel="noopener noreferrer" class="text-mlq-strong hover:underline">SECURITY.md</a>,
  not via PR. Community standards are in
  <a href="https://github.com/LegalQuants/lq-ai/blob/main/CODE_OF_CONDUCT.md" target="_blank" rel="noopener noreferrer" class="text-mlq-strong hover:underline">CODE_OF_CONDUCT.md</a>.
</p>
