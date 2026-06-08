# Donna — Product Overview

**Status:** v0.1.0 (first public release) · **License:** Apache-2.0 · **By:** LegalQuants

> A friendly, document-forward frontend for the [LQ.AI](https://github.com/LegalQuants/lq-ai)
> legal-AI engine. Donna makes a powerful, self-hostable legal-AI backend usable by a working
> lawyer — without giving up transparency, privilege, or control over where inference runs.

---

## Why Donna exists

LQ.AI is a capable legal-AI backend — retrieval, a character-verified citation engine,
anonymization, skills, playbooks, tabular review, and an autonomous runtime. But its power lived
behind a developer-oriented surface. **Donna is the answer to "what would this look like if it were
built for the person doing the legal work?"**

Three commitments shape every screen:

1. **Reading-first, document-forward.** The interface is calm and legible — inspired by
   [MikeOSS](https://github.com/willchen96/mike) — because legal work is reading work. Citations,
   redlines, and source documents are first-class, not afterthoughts.
2. **Transparency over magic.** Every answer can show its work: which sources were retrieved, which
   model ran, whether anonymization was applied, and — for autonomous runs — every phase, tool call,
   and cost. Citations are **character-verified** against the source text, not merely plausible.
3. **The user controls the inference.** Inference can be **free and local** (Ollama) or routed to
   cloud models under **your own provider keys** — per category, with per-matter tier floors. No
   lock-in, no mandatory third party in the loop.

The result is a product on par with proprietary legal-AI tools — but free, transparent, and one the
user (or their firm) can run and govern themselves.

## Who it's for

- **Practicing lawyers and legal teams** who want conversational legal work — drafting, review,
  Q&A over their own documents — with citations they can trust and open.
- **Privacy- or privilege-sensitive users** who need to keep matters segregated, enforce a minimum
  model tier on privileged work, and see exactly what left the building.
- **Firms and self-hosters** who want to own the stack: a free frontend over a self-hostable
  backend, with inference they choose and control.

## What Donna does

### Assistant

Conversational legal work with streaming answers and **character-verified citation pills** — hover
for the source quote, click to open a docked **document panel** jumped to the exact cited passage.
A per-turn **receipts drawer** shows every retrieval, inference, and skill event behind an answer.
Each composer offers **prompt enhance**, **per-message file attachment**, **saved-prompt** insertion,
a **model/tier picker**, and **skill attachment** with a typed input form.

### Matters

Scope chats to a **matter** that carries its own files, linked knowledge bases, attached skills, and
free-form context. Mark a matter **privileged** to enforce a **minimum inference tier** in the
composer — so sensitive work can't silently route to a lower-trust model.

### Knowledge & retrieval

Create and manage **knowledge bases**: upload documents that auto-ingest for retrieval (RAG), watch
ingest status live, tune hybrid search, and download source files. Scoping a chat to a matter with a
KB lights up grounded, cited answers.

### Workflows — four kinds of reuse

- **Skills** — reusable instruction blocks with typed inputs; author your own or fork built-ins,
  attach per-message.
- **Playbooks** — negotiation positions applied to a contract → a verdict scorecard and a
  consolidated **redline** view. Browse built-ins, apply them, **generate** a draft playbook from
  your own documents, or author one manually.
- **Saved prompts** — named snippets inserted at the cursor.
- **Automations** — runs Donna executes on its own (run-now, cron schedules, KB-arrival watches).
  Every run is **transparent and auditable**: a receipt of phases, tool calls, cost, and terminal
  reason, plus its **results** — findings, **document-grade artifacts** (memos saved into the run's
  knowledge base, openable from the receipt), proposed memories, and recurring precedents — with a
  review queue and a notifications inbox.

### Tabular review

Ask the same questions across many documents and get a **cited, confidence-scored grid**, with
per-column model-tier floors, **ensemble verification**, Excel/CSV export, and a run history you can
resume — every cell navigable back to its source.

### Trust & control

A **trust matrix** of what each model tier means and where it runs; **ambient trust pills** that
surface the active posture; **anonymization** visibility in receipts; **data export** and
**scheduled deletion**; and **model management** — per-category routing, local Ollama models, and
**bring-your-own provider keys**.

### In-app guidance

A full guide at **/about**, including interactive playgrounds that explain how the LQ-AI engine
works under the hood.

## How it's built (one paragraph)

Donna is a standalone SvelteKit app acting as a **backend-for-frontend**. The browser talks only to
Donna's server, which holds the lq-ai JWT in httpOnly cookies, proxies to the lq-ai API with a bearer
token, and refreshes transparently on `401` — so there's no CORS and the JWT never reaches client
JavaScript. The lq-ai backend is **vendored as a pinned git submodule** and brought up by Donna's
compose file, so the whole product runs together. Donna consumes only lq-ai's **published API** —
when it needs something the API doesn't expose, that becomes a tracked upstream request rather than a
private coupling. See [CLAUDE.md](../CLAUDE.md) for the full engineering picture.

## Design principles

- **Show the work.** Prefer a receipt, a citation, or a cost line over an unexplained result.
- **Don't mislabel trust.** A citation says "verified" only when it is; a model floor that can't be
  met is shown, not hidden.
- **Degrade honestly.** A failed sub-fetch hides a section or shows "unavailable" — it never breaks
  the page or fakes data.
- **Consume the contract, don't fork it.** Types derive from lq-ai's OpenAPI; gaps become upstream
  requests.
- **Reading-first.** Calm typography, generous space, documents at the center.

## Non-goals (for now)

- **Not a backend.** Donna implements no legal-AI logic itself — retrieval, the citation engine,
  anonymization, skills/playbooks, and the autonomous runtime all live in lq-ai.
- **No billing / subscriptions.** lq-ai is self-hostable; there is no plan or payment concept.
- **No document authoring suite.** Donna reads, cites, redlines, and reviews documents; it is not a
  word processor. (Artifact memos are markdown/plain-text in v0.1.0.)
- **Not legal advice.** Donna is a tool for legal professionals; outputs are assistance, not advice.

## Where to go next

- **Run it:** [README.md](../README.md) — prerequisites, setup, the compose bring-up, and verify.
- **Build on it:** [CLAUDE.md](../CLAUDE.md) — architecture, workflow, conventions, and how to pick
  up a roadmap item.
- **What's planned:** [docs/roadmap/donna-future-roadmap.md](roadmap/donna-future-roadmap.md).
- **What shipped:** [CHANGELOG.md](../CHANGELOG.md).
