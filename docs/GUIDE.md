# Donna & LQ-AI — A Guide

**What it is, what you can do with it today, and what you could build on top of it.**

> Donna is a friendly, document-forward application for legal work — chat with your documents,
> review contracts, run a playbook, automate recurring review — with answers you can trust because
> you can see exactly where they came from. It's free, open source, and runs on inference you
> control: free and local on your own hardware, or routed to cloud models under your own keys.
>
> But Donna is also **one example** of what the platform underneath it — **LQ-AI**, an open-source
> legal operating system — makes possible. This guide explains both: what Donna does, how it works,
> and what else you (or your firm, your clinic, your students) could build on the same foundation.
>
> You don't need to be a developer to read this. If you'd rather see it running than read about it,
> everything below is also explained — with interactive playgrounds — inside the app at **/about**.

---

## The big idea

Most legal-AI products are closed boxes. You send a question, you get an answer, and you take it on
faith. LQ-AI was built on the opposite premise: a capable legal-AI backend — retrieval over your own
documents, a citation engine that **verifies** quotes against their source, an anonymization layer
that strips identifying data before anything leaves your network, skills and playbooks that encode
legal reasoning, tabular review across document sets, and an autonomous runtime that can run work on
its own and hand you a receipt — all **open source**, all **self-hostable**, and all designed to be
read, extended, and trusted rather than taken on faith.

**Donna is the friendly face of that platform.** Where LQ-AI exposes the full machinery, Donna
presents a calm, reading-first experience tuned for day-to-day legal work — approachable enough for a
solo practitioner on a budget, controllable enough for a firm that wants to govern exactly how client
data is used.

And because the whole stack is open, Donna is also an **invitation**. The same backend that powers
Donna can front entirely different products. The rest of this guide first shows what that opens up —
then walks through Donna itself so you can see the pieces in action.

---

## What you could build on LQ-AI

Donna uses _some_ of LQ-AI's capabilities. Here's a sense of what else the same foundation supports —
for product builders, for contributors, for teachers, and for organizations working on access to
justice.

### Power new applications

The same backend that drives Donna's chat, playbooks, tabular review, autonomous runs, and knowledge
retrieval can front entirely different products:

- **A clause-library browser** that lets transactional lawyers search, compare, and tag contract
  clauses against a RAG-indexed precedent bank — with the citation engine flagging each match as
  verified or caveated.
- **A deposition-prep assistant** that ingests case documents into a knowledge base and surfaces
  witness-specific question sets via playbooks.
- **A compliance-checklist tool** that runs a saved-prompt workflow over uploaded policies and
  returns a structured tabular review mapping each regulatory requirement to the relevant section — or
  flagging gaps as unverified.
- **A due-diligence data-room triage** that ingests a target's data room and runs one tabular pass
  across hundreds of agreements to surface change-of-control, assignment, exclusivity, and MFN
  clauses in a single cited grid — turning a week of associate reading into an afternoon of review.
- **A lease- or portfolio-abstraction tool** that extracts the terms that matter (rent, term,
  renewal, CAM, assignment, termination) across an entire book of leases, each value linked to the
  page it came from.
- **A regulatory-change monitor** built on a _watch_: when a new rule or policy lands in a knowledge
  base, an automation fires a playbook that maps it to the firm's affected clauses and flags what
  needs revisiting — with a receipt of exactly what it checked.
- **A contract-lifecycle watchdog** that watches a knowledge base of executed agreements and surfaces
  upcoming renewals, notice deadlines, and standing obligations as findings on a schedule.
- **A plain-language explainer** for clients and self-represented people — a skill that rewrites a
  clause, letter, or order into plain English, grounded in the actual document so nothing is invented.

The common thread: every one of these inherits **grounded, cited, verifiable** answers for free,
because retrieval, citation verification, and anonymization live in the backend — not in each app.

### Extend LQ-AI itself

LQ-AI is designed to grow through contributions:

- **Author new skills** — focused, reusable prompt units — and chain them into **playbooks** that
  encode multi-step legal reasoning. A skill is a structured file (a system prompt, an input schema,
  reference documents, and a worked example a practicing attorney can evaluate); the app even ships an
  interactive **Skill Format Explorer** that validates structure as you write.
- **Add a model provider** — another cloud API, or a locally-hosted Ollama model — with only a small
  adapter alongside the existing provider registry.
- **Improve the trust modules.** The citation engine and anonymization layer are independent: better
  redaction heuristics, jurisdiction-specific citation formats, or tuned verified/caveated/unverified
  thresholds are all self-contained contributions.
- **Build on the autonomous primitives** — the planner and tool-call scaffolding behind multi-step
  tasks — which are open for extension, with an alignment guide that makes "autonomy you can audit" a
  concrete checklist rather than a slogan.

Skills carrying legal substance go through an **attestation review** — a practicing attorney confirms
the legal content — so the catalogue stays trustworthy. The contributor guide covers the mechanics,
and a set of curated "shortest-path" mini-PRDs gives newcomers well-scoped first contributions.

### Learn & teach

**For law students.** The interactive playgrounds in the app let you see exactly how legal AI works
under the hood — how retrieval pulls passages from a knowledge base, how the citation engine decides
what counts as verified versus caveated, how anonymization strips identifying information before a
prompt ever leaves your network. From there:

- **Build a skill or playbook for a contract type you study** (NDA, SaaS agreement, merger
  agreement) — a concrete course project that produces something real, no machine-learning background
  required.
- **Run a governance experiment.** The tier/refusal system — which controls what queries a model
  will and won't answer based on data sensitivity — is a live, inspectable example of AI-governance
  design. Ask the same question at different tiers and watch the Gateway permit or refuse; it's a
  ready-made seminar exercise on responsible AI.
- **Do real, publishable research.** The project openly notes that anonymization recall on a
  legal-document corpus is empirically unmeasured — a genuine, well-scoped study a student could run
  and contribute back.
- **Compare models, honestly.** Send the same legal question to a top cloud model and a small local
  one and read the difference — a grounded lesson in capability, cost, and when each is appropriate.

**For law professors.** The open codebase and the playgrounds can serve as **primary teaching
material** for a legal-AI or law-and-technology course — students read the source rather than a vendor
white paper:

- **A "build a playbook" assignment** gives hands-on exposure to prompt engineering and workflow
  design in a legal context, again with no ML prerequisite.
- **The citation cascade and tier governance** are ready-made, inspectable case studies for a
  responsible-AI or professional-responsibility unit — concrete artifacts, not abstractions.
- **A clinic capstone.** The architecture is thin enough that a student team can fork a Donna-style
  frontend, adapt it to a specific legal-aid workflow, and deploy it against the same backend **in a
  semester** — producing a tool a real organization can keep using.

### Access to justice

Because LQ-AI is open source and supports **local model providers through Ollama**, the stack can be
adapted for pro-bono and access-to-justice settings where commercial SaaS licensing is simply out of
reach:

- **Run the whole system on local hardware** — no data leaves the premises, and no per-query cost
  accrues — while still getting knowledge-base retrieval, anonymization, and the citation engine. For
  a legal-aid organization handling sensitive client data on a shoestring, that combination is rare
  and important.
- **A scoped self-help frontend** for housing and eviction, public benefits, immigration,
  expungement, or family law could guide self-represented litigants or intake staff — in plain
  language, grounded in the organization's own vetted materials, with citations so a human can verify
  before relying on anything.
- **A court self-help-center assistant** that helps people find the right form and understand it,
  grounded in the court's own document set rather than the open internet.
- **A multilingual intake assistant** running on local models — no cloud cost, no data egress — for
  communities facing language barriers.
- **A matter-triage tool** that helps a small legal-aid office route scarce attorney time, checking
  incoming requests against a conflicts knowledge base.
- **Shared, adaptable workflows.** Because everything is Apache-licensed and self-hostable, a
  coalition of legal-aid organizations could build and share skills and playbooks across the
  community — each org adapting the same foundation to its own jurisdiction and caseload.

Even when a cloud model _is_ used, the anonymization layer and privileged-matter handling mean
sensitive client data is protected at the edge — so the bar for "good enough to use with real
clients" is reachable without a full self-hosting operation.

---

## Meet Donna

Now the application itself — what you actually see and do. (Every section below maps to a page of the
in-app guide at **/about**, where the same material is paired with live examples.)

### What Donna is

Donna is the streamlined, day-to-day face of LQ-AI. Everything is reachable from a single left
sidebar:

- **Assistant** — the main chat interface: start a conversation, attach files, apply skills or saved
  prompts.
- **Projects** (also called **matters**) — organize work by engagement so context stays together.
- **Workflows** — skills, playbooks, saved prompts, and automations: the reusable building blocks.
- **Tabular** — structured review: extract and compare fields across many documents in a grid.
- **About** — the in-app guide.
- **Settings** — account, model routing, and provider configuration.

A standing reminder runs through the whole product, and through this guide: **Donna's answers are not
legal advice.** They are AI-generated responses that can contain errors. Donna's job is to surface
sources and verification signals so _you_ can judge the answer — not to replace professional judgment.

### The Assistant — the core loop

You land on a composer that greets you by name. Type a question and press Enter; Donna streams the
answer back in real time, and the conversation moves to its own page (its own URL — bookmark it,
share it internally, return to it later). A few things make the composer more than a chat box:

- **✦ Enhance** rewrites a rough draft into a fuller, more precise prompt _before_ you send — with a
  preview and an optional "why these changes" explanation. Accept it or keep your original; nothing
  sends until you say so.
- **Skills** (the **+** button) attach structured instruction blocks — a contract-review checklist, a
  clause-extraction routine — that travel with your message so you don't retype guidance. Some skills
  expose typed input fields (text, number, toggle, drop-down) right in the composer.
- **Files** (the paperclip, or drag-and-drop) ground an answer in a specific document — up to 16 per
  message — with live upload/processing status.
- **Saved prompts** (the bookmark) insert reusable snippets at your cursor, or save your current
  draft for next time.
- **Model picker** chooses which model answers — a `smart` alias for depth, a `fast` one for speed,
  or a **local** model that never leaves your device.

When an answer draws on your documents, it embeds **numbered citation pills**. Hover one for the
source quote, filename, and page; the popover is color-coded — **green** verified, **amber** caveats,
**red** unverified. Click it to open the **document panel** beside the chat, with the cited passage
highlighted, so you can read the answer and its source side by side. And every chat has a **Receipts**
drawer listing every backend step behind the conversation — retrieval, inference, skills — exportable
as a log for auditing.

### Projects (matters) — shared context

A **Project** groups related chats, files, knowledge bases, skills, and standing context under one
name, so you give Donna a shared foundation instead of starting every conversation cold. A Project
can carry:

- **Files** attached directly to the matter.
- **Knowledge bases** linked in, so their documents are retrievable in every chat.
- **Skills** available by default to chats in the matter.
- **Standing context** — free-form notes (background facts, formatting preferences, recurring
  instructions) that Donna receives at the start of every chat in the Project.

Mark a matter **privileged** and it's flagged in the audit log and requires a **minimum model tier** —
so sensitive work can't silently route to an underpowered or lower-trust model. Start a chat from the
matter and it opens already scoped: standing context applied, knowledge and skills available, tier
floor enforced.

### Knowledge bases — grounding answers in your documents

A **knowledge base** is a named collection of documents Donna searches when answering — the mechanism
behind _retrieval-augmented generation_ (RAG). Instead of relying only on what a model already knows,
Donna pulls the most relevant passages from _your_ contracts, policies, and research and grounds its
answer in them — then cites them. You create KBs inside Projects, upload documents (PDF ingests most
reliably; watch each file move Pending → Processing → Ready), and optionally tune a **Hybrid alpha**
control that blends keyword search and meaning-based search. Answers from a KB always cite their
sources, so you can verify exactly which document and passage an answer came from.

### Workflows — four kinds of reuse

One hub, four tabs:

- **Skills** — saved instruction blocks. Use built-ins, **fork** one to customize, or author your own
  (name, description, an optional slash alias like `/nda`, tags, and the instructions themselves).
- **Playbooks** — a set of negotiation **positions** Donna applies to a contract: for each clause
  topic, your preferred language, fallback, and non-negotiable limits — so you get **consistent
  redlines every time** instead of rewriting guidance from scratch. Apply one to a document for a
  verdict scorecard and a consolidated redline; generate a draft playbook _from your own documents_;
  or build one by hand.
- **Saved Prompts** — reusable text snippets inserted at the cursor.
- **Automations** — Donna running work on its own (next section).

### Automations — work Donna runs on its own, with a receipt

Automations let Donna run a playbook or skill against a knowledge base in the background — **on
demand, on a schedule, or when new documents arrive** — and they're **off by default** until you opt
in. Three triggers:

- **Run now** — a one-off run against a target knowledge base, with an optional **cost cap** in USD.
- **Schedules** — the same run on a recurring cadence (described in plain language from a cron
  expression).
- **Watches** — a run that fires automatically when new documents land in a knowledge base.

The payoff is **transparency**. Every run leaves a full receipt: its status, how it was triggered,
what it cost, why it stopped, and an **Activity timeline** of every phase and tool call, updating live
while it works. And every run surfaces its **Results**:

- **Findings** — what the run noticed, in order, each with a severity badge.
- **Documents** — for opted-in runs, **document-grade artifacts**: memos the run writes into the
  target knowledge base, which you can open inline or download right from the receipt.
- **Memories** — durable notes the run proposes keeping (you approve).
- **Precedents** — recurring patterns the agent noticed, which you can promote into a matter's
  context.

A **Notifications** inbox links you straight to each finished run. Combined with cost caps and
receipts, you always know what ran, what it cost, and what it produced — autonomy you can audit.

### Tabular review — the same questions across many documents

Tabular review asks one set of questions across a whole document set and returns the answers in a
**cited grid**: one row per document, one column per question. Define columns ad hoc (a heading plus a
question like "Which state's law governs?") or pick a pre-built **table skill**. Each cell carries a
**confidence** signal and links back to the exact source passage; turn on **ensemble verification** on
a column and its answers are independently cross-checked, showing a green **✓ Verified** chip when you
open the source. Preview the cost before you run, watch progress live, click any cell to jump to its
source, and export the finished grid to Excel or CSV. Past reviews are listed and resumable.

### Models & inference control

Every message uses a model **alias** that the backend resolves at request time — `smart` for the
strongest cloud model, `fast` for speed, or a **local** Ollama model that runs on-device and sends
nothing outbound. Privileged matters automatically promote your choice to meet their tier floor.
**Settings → Models** is where a workspace is governed: per-category routing (admins assign which
model backs each alias), the list of installed local models, and **bring-your-own provider keys** —
paste an Anthropic or OpenAI key, applied immediately, stored write-only (Donna only ever shows the
last four characters). This is the control surface that lets a firm decide exactly how, where, and
under whose account inference runs.

### Trust & citations — the heart of it

Donna's defining commitment is that you never have to take an answer on faith:

- **Citation pills** are color-coded by how confidently each passage was matched — **green** (verified
  by exact/normalized match or ensemble agreement), **amber** (partial support or a single paraphrase
  judge), **red** (couldn't be confirmed). The grades aren't decoration; an unverifiable citation is
  _shown_ as unverified, not quietly dropped.
- **Receipts** record every backend event — retrieval counts, model/provider/token/latency for each
  inference, skills invoked — and export as a log.
- **Anonymization** strips identifiers at the edge before a prompt reaches a cloud provider; Donna
  shows an **Anonymized** badge when the backend confirms it ran. Local models send nothing outbound
  at all.
- **A standing disclaimer** appears on every composer: _"AI can make mistakes. Answers are not legal
  advice."_

---

## How it actually works (in plain terms)

You don't need this section to use Donna — but it's the part that makes the trust real, and it's what
makes Donna and LQ-AI worth studying. The in-app **Powered by LQ-AI** page turns each of these into an
interactive explorer; here they are in prose.

- **Three services, clear boundaries.** LQ-AI is a backend (the app's brain), an **Inference Gateway**
  (the _only_ component that holds provider API keys and makes outbound calls — the security
  boundary), and a web frontend. They talk over defined contracts; nothing shares hidden internal
  state.
- **A request, end to end.** When you send a message, it passes through several stages before a model
  sees it — attaching the right skill, retrieving knowledge-base passages, applying policy checks,
  recording an audit trail — and several more on the way back. Every step is inspectable.
- **The tier system — when the Gateway says no.** Five data-sensitivity tiers (Tier 1 = local /
  air-gapped, most secure; Tier 5 = consumer, least secure). A matter's _floor_ means "require this
  tier or stronger"; a weaker provider is **refused with a clear error**, not silently downgraded.
- **The citation cascade.** Every quote-and-source the model emits runs a four-stage check: exact
  match → tolerant match → paraphrase judge → optional ensemble. The first stage to verify wins; a
  citation that misses every stage **is not persisted** — its absence _is_ the "unverified" signal.
- **Anonymization, in memory only.** Before a request leaves for a cloud provider, detected entities
  (names, organizations, emails, phone numbers, case and matter numbers, and more) are pseudonymized,
  then rehydrated on the response. The mapping lives in process memory only — never persisted, never
  logged. Privileged-matter chats skip the layer entirely; retrieval passages are left intact so
  citations can be grounded.
- **Where your data lives.** LQ-AI is self-hosted: by default, conversations, knowledge, and skills
  stay inside the operator's deployment and never touch any vendor's infrastructure. The only outbound
  path is the Gateway's inference call — and only when the matter's tier floor permits it.
- **Autonomy you can audit.** When an agent acts without a human approving each step, transparency
  moves from "you can read the prompt" to "you can audit the behavior": every tool call goes through a
  single brake-checked chokepoint (halt state, phase grant, and cost cap are all checked _before_ the
  tool runs), everything is logged as counts and types only — never raw content — and every run ends
  in a user-readable receipt.

That honesty extends to the project's own voice: where something is scaffolding rather than
production-ready, or tested in principle but unmeasured in practice, the documentation **says so**.
That trust-forward posture is the point — of the product and of the platform.

---

## Who it's for, right now

Donna isn't a someday prototype — it's usable today, across a wide range:

- **The solo practitioner on a budget** can run it on local hardware with free local models: grounded,
  cited answers over their own documents at no per-query cost.
- **The firm that wants control** can route inference through its own provider keys, enforce model
  tiers on privileged matters, keep data in its own deployment, and audit every answer.
- **The legal-aid organization** can self-host the whole stack, keep client data on the premises, and
  scope a slim frontend to the matters it actually handles.
- **The student or professor** can read the source, build a real skill or playbook, and study how
  legal AI — and AI governance — actually work.

Donna shows one shape this can take. The platform invites the others.

---

## Getting started

- **Just want to see it?** The in-app guide at **/about** covers everything here with live, interactive
  playgrounds — no setup required once an instance is running.
- **Want to run it yourself?** The [README](../README.md) has the full setup: it's a single
  `docker compose` bring-up, and inference can be entirely free and local. You don't have to be a
  developer to follow it, but it does assume you can run a few terminal commands.
- **Want to build on it?** Start with [docs/PRODUCT.md](PRODUCT.md) for the product picture and
  [CLAUDE.md](../CLAUDE.md) for the engineering guide; LQ-AI's own contributor path (skill authoring,
  curated first contributions, the alignment guide) lives in the **Powered by LQ-AI → How to Build**
  page and the [lq-ai repository](https://github.com/LegalQuants/lq-ai).

---

_Donna and LQ-AI are open source under the Apache 2.0 license. Donna's answers are not legal advice —
they are tools for legal professionals, meant to surface sources and verification signals so a
qualified human can judge them. Always verify before you rely._
