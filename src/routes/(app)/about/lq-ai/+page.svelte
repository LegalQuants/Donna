<script lang="ts">
  import { lqLearnSections } from '$lib/about/lqLearnSections';
  import LqLearnSection from '$lib/about/LqLearnSection.svelte';
</script>

<svelte:head><title>Powered by LQ-AI — About Donna</title></svelte:head>

<h1 class="mb-4 text-xl font-medium text-mlq-text">Powered by LQ-AI</h1>

<p class="mb-3 max-w-prose text-sm leading-relaxed text-mlq-text">
  Donna is powered by LQ-AI, an open source legal operating system. Donna uses some, but not all, of
  the functionality available in LQ-AI. The interactive surfaces below walk through how LQ-AI (and
  Donna) work, from a request to a verified, cited answer.
</p>

<div class="mt-8">
  {#each lqLearnSections as section (section.number)}
    <LqLearnSection {section} />
  {/each}
</div>

<section class="mt-12 border-t border-mlq-subtle pt-8">
  <h2 class="mb-3 text-lg font-medium text-mlq-strong">Build &amp; learn with LQ-AI</h2>
  <p class="mb-5 max-w-prose text-sm leading-relaxed text-mlq-text">
    Donna is one application built on LQ-AI. Because the whole stack is open source, here is some of
    what else you could build — and teach — with it.
  </p>

  <h3 class="mb-2 text-sm font-medium uppercase tracking-wide text-mlq-muted">Power new applications</h3>
  <p class="mb-2 max-w-prose text-sm leading-relaxed text-mlq-text">
    The same backend that powers Donna's chat, playbooks, tabular review, and knowledge retrieval can
    front entirely different products. A clause-library browser could let transactional lawyers search,
    compare, and tag contract clauses against a RAG-indexed precedent bank, with the citation engine
    flagging each match as verified or caveated. A deposition-prep assistant could ingest case
    documents into a knowledge base and surface witness-specific question sets via playbooks. A
    compliance-checklist tool could run a saved-prompt workflow over uploaded policies, returning a
    structured tabular review that maps each regulatory requirement to the relevant section — or flags
    gaps as unverified.
  </p>

  <h3 class="mb-2 mt-5 text-sm font-medium uppercase tracking-wide text-mlq-muted">Extend LQ-AI itself</h3>
  <p class="mb-2 max-w-prose text-sm leading-relaxed text-mlq-text">
    LQ-AI is designed to grow through contributions. You can author new skills — focused, reusable
    prompt units — and chain them into playbooks that encode multi-step legal reasoning workflows.
    Adding a new model provider (another cloud API or a locally-hosted Ollama model) requires only a
    small adapter alongside the existing provider registry. The citation engine and anonymization layer
    are independent modules: improving redaction heuristics, expanding jurisdiction-specific citation
    formats, or tuning verified/caveated/unverified thresholds are all self-contained contributions.
    For more ambitious work, the autonomous primitives — the planner and tool-call scaffolding that
    underpin multi-step tasks — are open for extension. The project's contributor guide covers the
    mechanics.
  </p>

  <h3 class="mb-2 mt-5 text-sm font-medium uppercase tracking-wide text-mlq-muted">Learn &amp; teach</h3>
  <p class="mb-2 max-w-prose text-sm leading-relaxed text-mlq-text">
    For <strong>law students</strong>: the interactive playgrounds on this page let you see exactly how
    legal AI works under the hood — how retrieval pulls documents from a knowledge base, how the
    citation engine decides what counts as verified versus caveated, how anonymization strips
    identifying information before a prompt leaves your network. From there, building a skill or
    playbook for a contract type you study (NDA, SaaS agreement, merger agreement) makes a concrete
    course project that produces something real. The tier/refusal governance system — which controls
    what queries the model will and won't answer — is a live, inspectable example of AI-governance
    design, useful for any seminar touching on responsible AI.
  </p>
  <p class="mb-2 max-w-prose text-sm leading-relaxed text-mlq-text">
    For <strong>law professors</strong>: the open codebase and the playgrounds on this page can serve
    as primary teaching material for a legal-AI or law-and-technology course — students read the source
    rather than a vendor white paper. A "build a playbook" assignment gives students hands-on exposure
    to prompt engineering and workflow design in a legal context without requiring any ML background.
    For clinics, the architecture is thin enough that a student team can fork a Donna-style frontend,
    adapt it to a specific legal-aid workflow, and deploy it against the same backend in a semester —
    producing a tool a real organization can use.
  </p>

  <h3 class="mb-2 mt-5 text-sm font-medium uppercase tracking-wide text-mlq-muted">Access to justice</h3>
  <p class="mb-4 max-w-prose text-sm leading-relaxed text-mlq-text">
    Because LQ-AI is open source and supports local model providers through Ollama, the stack can be
    adapted for pro-bono and access-to-justice settings where commercial SaaS licensing is out of
    reach. A legal-aid organization can run the entire system on local hardware — no data leaves the
    premises and no per-query cost accrues — while still benefiting from knowledge-base retrieval,
    anonymization, and the citation engine. A slim Donna-style frontend scoped to housing, benefits, or
    immigration matters could be deployed for self-represented litigants or intake staff with minimal
    ongoing cost.
  </p>

  <p class="mb-4 max-w-prose text-sm leading-relaxed text-mlq-text">
    <!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- to how-to-build -->
    <a href="/about/lq-ai/build" class="font-medium text-mlq-strong hover:underline">How to build on LQ-AI →</a>
    — the contribution path, skill authoring (with an interactive SKILL.md explorer), and the roadmap.
  </p>

  <p class="max-w-prose text-sm text-mlq-muted">
    Explore the project:
    <a href="https://github.com/LegalQuants/lq-ai" target="_blank" rel="noopener noreferrer" class="font-medium text-mlq-strong underline">LegalQuants / lq-ai on GitHub</a>.
  </p>
</section>
