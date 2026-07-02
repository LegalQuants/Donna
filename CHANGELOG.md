# Changelog

All notable changes to Donna are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/); versions follow [SemVer](https://semver.org/).

## [Unreleased] — Fiduciary auditability

### Added

- **Fiduciary receipts** across chat and autonomous sessions: a per-answer trust pill (four honest states, incl. the zero-assertion neutral state) opening a citation ledger of sources, quoted passages, and verification status, with click-through to each source.
- **Case treatment** signals on caselaw citations (cited-by, followed/distinguished/criticised) — derived, not editorial.
- **Autonomous matter audit timeline** — the session ledger + a session-level trust pill on the receipt, alongside cost.
- **Provenance export** — download any chat turn or session receipt as a structured JSON envelope + printable Markdown, honestly labelled as not a signed attestation.
- **Authoritative sources** card on Research, and a new **About → Fiduciary receipts** guide with an interactive trust-states explorer.

## [0.3.0] — 2026-06-24 — Sticky skills

A per-chat **"Keep skills on"** toggle so applied skills carry forward into follow-up turns without
re-attaching.

### Added

- **Sticky skills** — a **Keep skills on** switch in the in-chat composer toolbar. Turn it on and
  the skills you have attached to the current turn are kept in place for every follow-up message in
  that chat, with a quiet **"Keeping _N_ on"** indicator (skill names on hover) when active.
- **Design posture:** off by default, per-chat scope (state lives on the chat row — a new chat
  always starts off), and audit-honest — every turn still records its own `applied_skills` so the
  receipt is never misleading.
- Backed by backend pin bump `658fdbc` → **`5ad9f9e`** (lq-ai PR #211: `chats.sticky_skills text[]`
  column + message-create `set_sticky` field).

## [0.2.0] — 2026-06-21 — Legal research + MCP

The **legal research + MCP** milestone — surfacing LQ-AI's CourtListener case-law research and
Model Context Protocol tool support in Donna, governed and transparent.

### Added

- **Research workspace** (`/research`) — search U.S. case law via **CourtListener**, read full
  opinions in the document panel, _find in opinion_, and **verify citations** in a block of text
  against the source.
- **Governed chat tool-loop** — the assistant can consult case law and connected tools mid-answer,
  pausing for your **Approve / Deny** before it runs one; a **connect-on-demand** prompt links an
  account inline when a tool needs it.
- **External-source citations** — a **"sources consulted"** panel + provenance pill beneath answers
  that consulted case law, each row linking to the case on CourtListener (distinct from the
  character-verified quote citations).
- **MCP tool administration** (`/settings/mcp`) — admins view operator-connected Model Context
  Protocol servers and enable individual tools (with read-only / destructive / needs-confirmation
  badges).
- **Per-user Connections** (`/settings/connections`) — connect your own account to OAuth-protected
  MCP tool servers.
- **Built-in skill inspector** (`/skills/view/{name}`) — read a built-in skill's content and its
  declared connector usage ("Uses: …", with an amber note when a connector isn't configured).
- **In-app guidance** — new About pages (**Research**; **Tools & connections**), plain-language
  explainers on each new surface, and clickable starter searches / example prompts.
- An **empty-response fallback** — a completed turn that returns no content now shows an honest
  message with a **Retry**, instead of a blank bubble.

### Changed

- Backend pin advanced from `c4d4482` to **`658fdbc`** (lq-ai WS2–WS5: CourtListener research, the
  MCP client, the governed tool-loop, and transparency / external-source citations).

## [0.1.0] — 2026-06-07 — First public release

Donna's first public release: a friendly, document-forward frontend for the
[LQ.AI](https://github.com/LegalQuants/lq-ai) legal-AI engine. Inference can be **free and local**
(Ollama) or **fully user-controlled** (bring-your-own provider keys) — the product is free and the
backend is self-hostable. Donna talks to lq-ai only through its published API and vendors that
backend as a pinned git submodule (pin `c4d4482`), so the whole product runs from one compose file.

### Assistant

- Streaming chat with **character-verified citation pills** — hover for the source quote, click to
  open a docked document panel jumped to the exact cited passage (PDF rendering + verbatim
  text-layer highlighting; inline markdown/plain-text rendering for text documents).
- Per-turn **receipts drawer** exposing every retrieval, inference, and skill event behind an
  answer, including whether anonymization was applied.
- **Prompt enhance** on every composer (landing + in-chat), **per-message file attachment**, a
  **saved-prompts** inserter, a **model/tier picker**, and **skill attach** with a typed
  **skill-inputs form**.

### Matters (projects)

- Scope chats to a matter with files, linked knowledge bases, attached skills, and free-form
  context. **Privileged** matters enforce a **minimum inference tier** in the composer.

### Knowledge bases

- Create, link, and upload; documents auto-ingest for retrieval (RAG) with live status, hybrid-search
  (alpha) tuning, and per-file download.

### Workflows

- **Skills** — author your own or fork built-ins; typed inputs with a per-message input form;
  slash aliases.
- **Playbooks** — negotiation positions applied to a contract → verdict scorecard + a consolidated
  **redline** view; browse, apply, generate a draft from your own documents (easy-gen), or author
  manually with a full position editor.
- **Saved prompts** — reusable snippets inserted at the cursor.
- **Automations** — runs Donna executes on its own: **run-now**, **cron schedules**, and
  **KB-arrival watches**, each opt-in per user. Every run leaves a **transparency receipt** (phases,
  tool calls, cost, terminal reason) and surfaces its **results**: findings, **document-grade
  artifacts** (memos written into the run's target knowledge base, openable inline or downloadable
  from the receipt), proposed **memories**, and recurring **precedents** — with a review queue
  (keep/dismiss/promote) and a **notifications inbox**.

### Tabular review

- Ask the same questions across many documents → a cited, confidence-scored grid; per-column
  model-tier floors and **ensemble verification**; Excel/CSV export; run history with resume and
  cell→source citation navigation.

### Settings

- Account & security (profile view + **display-name edit**, MFA disable), **data export** and
  **scheduled deletion** (with a pending-deletion banner), preferences (ambient trust pills,
  provenance visibility, automations opt-in), a read-only **trust matrix**, and **model management**:
  per-category routing, installed local (Ollama) models, and **bring-your-own provider keys**
  (admin, hot-applied, write-only).

### Guidance

- An in-app guide at **/about** — instructional pages for every area plus interactive playgrounds
  explaining how the LQ-AI engine works.

### Architecture

- A **backend-for-frontend**: the browser talks only to Donna's SvelteKit server, which holds the
  lq-ai JWT in httpOnly cookies, attaches `Authorization: Bearer` when proxying, and refreshes on
  `401` — no CORS, and the JWT never reaches client JavaScript.

### Notable upstream-driven capabilities & fixes (lq-ai)

- Skill inputs reach the model for non-templated (built-in) skills (lq-ai #115).
- Per-message chat file attachment (lq-ai #116/#117); profile edit via `PATCH /users/me` (#118).
- Navigable tabular cell citations (#125) and per-column ensemble verification (#127).
- Autonomous run **findings** persisted/readable (#135); **document-grade artifacts** (#138).
- arq-worker **skill-registry initialization** so `skill_ref` automations resolve on the worker
  (#139) — previously every worker-side `skill_ref` run failed at startup.

### Engineering

- Quality bar held throughout: `npm run check` 0/0, `npm run lint` fully green, 1318 unit/component
  tests, plus live Playwright e2e per feature. Every feature shipped through a
  brainstorm → spec → plan → subagent-driven execution → review → PR loop; specs and plans for every
  phase are archived under `docs/superpowers/`.

[0.2.0]: https://github.com/LegalQuants/Donna/releases/tag/v0.2.0
[0.1.0]: https://github.com/LegalQuants/Donna/releases/tag/v0.1.0
