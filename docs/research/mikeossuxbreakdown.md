# MikeOSS UX Breakdown — Reference for the Mike-LQ Frontend Build

> **Purpose:** A full reconstruction of the MikeOSS user experience, screen by screen and workflow by workflow, written for the Claude Code agent that will build a MikeOSS-styled frontend on the LQ.AI backend. Every section pairs "what MikeOSS does" with "what LQ.AI adds" (verified citations, anonymization, tier awareness, audit, skill transparency) so the agent can replicate the _feel_ of Mike while delivering the _substance_ of LQ.AI.
>
> **Companion docs:** [`mikeoss-frontend-scope.md`](mikeoss-frontend-scope.md) (the workstream/task breakdown), [`HONEST-STATE.md`](HONEST-STATE.md) (what the backend actually ships), [`PRD.md`](PRD.md).

---

## 0. Methodology + honesty note

This breakdown was **reconstructed from the MikeOSS source** (`github.com/willchen96/mike`, `main` branch) — the actual Next.js component tree, not the marketing site.

Two things I could **not** access and which a human should verify against:

- **`mikeoss.com`** — blocked by this environment's network allowlist. The marketing site likely shows a more polished/curated version than the OSS source.
- **The video walkthrough** — I cannot review video. Anything about motion, timing, or narrated workflow beyond what the code reveals should be checked against the video by a human.

That said, the source is the better reference for a _replication_ task: it's the ground truth of what the app actually does, including exact component names, button labels, placeholder text, and state machines. Where I quote a label in "double quotes," it is verbatim from the source. Where I describe layout, it is read from the JSX/Tailwind classes.

**Pin the reference commit.** Before building, capture the MikeOSS `main` HEAD SHA so this breakdown and the build target the same version; MikeOSS evolves.

---

## 1. Stack + architecture (what you're replicating, and what you're NOT)

| Layer               | MikeOSS                                                                         | Mike-LQ target                                                                                                                                |
| ------------------- | ------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Framework           | Next.js 16 (App Router) + React 19                                              | **SvelteKit** (keep the OpenWebUI fork; do not port to Next.js — see [`mikeoss-frontend-scope.md` Decision MLQ-1](mikeoss-frontend-scope.md)) |
| Styling             | Tailwind v4 + `class-variance-authority` + `tailwind-merge`                     | Tailwind (already in `web/`) + a new LQ.AI token layer                                                                                        |
| Primitives          | Radix UI (`@radix-ui/react-dropdown-menu`, `-slot`, `-icons`)                   | bits-ui / melt-ui (Svelte Radix-equivalents)                                                                                                  |
| Icons               | `lucide-react`                                                                  | `lucide-svelte`                                                                                                                               |
| Markdown            | `react-markdown` + `remark-gfm` + `remark-math` + `rehype-katex` + `rehype-raw` | OpenWebUI's existing markdown+KaTeX pipeline                                                                                                  |
| Rich text / redline | TipTap (`@tiptap/react`, `-starter-kit`, `tiptap-markdown`)                     | TipTap core wrapped in Svelte (scope doc W2)                                                                                                  |
| PDF                 | `pdfjs-dist` 4.x (canvas + text layer)                                          | `pdfjs-dist` (or OpenWebUI's existing viewer)                                                                                                 |
| DOCX                | `mammoth` (parse), `docx` + `docx-preview` (render/generate)                    | Document Pipeline already parses DOCX server-side                                                                                             |
| XLSX                | `exceljs` (client-side export)                                                  | M3-C4 ships server-side export                                                                                                                |
| Charts              | `recharts`                                                                      | optional                                                                                                                                      |
| Auth/DB             | Supabase (auth-helpers, auth-js, supabase-js)                                   | **LQ.AI backend-owned auth** (`api/app/api/auth.py`); no Supabase                                                                             |
| Storage             | Cloudflare R2 / S3 (presigned)                                                  | MinIO/local today                                                                                                                             |
| Model access        | OpenRouter SDK, **per-user BYO keys**                                           | **Gateway holds keys** (security boundary; no per-user keys — Decision MLQ-2)                                                                 |
| License             | AGPL-3.0-only                                                                   | (LQ.AI's own license; do not copy MikeOSS code verbatim — replicate behavior, not source)                                                     |

**The single most important architectural divergence:** MikeOSS routes inference through per-user API keys stored in Supabase; LQ.AI routes through the gateway, which is the only key-holder. Everywhere MikeOSS shows "add your API key," Mike-LQ shows "your request routed to {model} at Tier {N}" instead. This is an upgrade, not a port.

---

## 2. Global layout + navigation

**Two-column responsive shell** (`(pages)/layout.tsx` + `shared/AppSidebar.tsx`):

- **Left sidebar** (`AppSidebar`) — persisted open/closed to `localStorage` on desktop; auto-collapses below the 768px breakpoint. Resize listeners flip it when crossing the breakpoint.
- **Main content** — full-height flex column; `overflow-hidden` on desktop, scrollable on mobile.
- **Mobile header** — appears only `< 768px`; a `PanelLeft` (Lucide) icon toggles the sidebar.
- Wrapped in two context providers: `ChatHistoryProvider` (recent chats for the sidebar) and `SidebarContext` (open/closed state).

**Sidebar contents** (top → bottom, from `AppSidebar.tsx` + `SidebarChatItem.tsx`): logo, primary nav (Assistant / Projects / Tabular Reviews / Workflows), a recent-chats list rendered as `SidebarChatItem`s, and an account/footer entry. _(Exact ordering and labels should be confirmed against `AppSidebar.tsx`; the nav destinations map 1:1 to the `(pages)` routes in §3.)_

**Mike-LQ mapping:** OpenWebUI already has a collapsible left sidebar with chat history. The work is restyling it to Mike's IA and renaming destinations:

| Mike nav        | Mike-LQ route (exists today)         |
| --------------- | ------------------------------------ |
| Assistant       | `/lq-ai/chats`                       |
| Projects        | `/lq-ai/matters`                     |
| Tabular Reviews | `/lq-ai/tabular` (M3-C)              |
| Workflows       | `/lq-ai/playbooks` + `/lq-ai/skills` |
| Account         | `/lq-ai/settings`                    |

---

## 3. Design language

Read from the Tailwind classes across components:

- **Typography:** Headings use a **serif** face at `text-2xl`, medium/light weight (e.g., Projects/Workflows titles; the assistant greeting is serif light). Body and assistant message content also render in **serif** — this is a deliberate "legal document" feel, not the usual sans chat UI.
- **Palette:** White backgrounds, gray accents (`bg-gray-100`, `text-gray-400/700`, `border-gray-*`). Restrained, document-forward. Accent colors are semantic: **blue** for workflow chips, **red** for PDF file icons / error / API-key-missing alerts, **black** for document chips, **green** for success checkmarks.
- **Shape:** Generous rounding — composer is `rounded-t-[20px]`, buttons `rounded-lg`, citation pills fully rounded.
- **Motion:** Subtle. The assistant landing has a staggered entrance (icon + greeting slide apart over 900ms cubic-bezier, text fades in at 300ms delay). Streaming shows a spinning `MikeIcon`; completion flips it to a checkmark briefly; error shows a red variant. Loading uses shimmer skeletons (`animate-[shimmer_2s_ease-in-out_infinite]`).
- **Density:** Tables are dense with sticky headers + sticky first (name) column for horizontal scroll. Lots of inline-edit affordances rather than separate edit screens.

**Mike-LQ note:** the serif-everywhere choice is the most recognizable part of Mike's identity. Capture it in the W1-1 token layer (`--mlq-font-serif` for headings + message body). LQ.AI's existing citation chips, tier badge, and receipts drawer then sit inside this typographic frame.

---

## 4. Screen-by-screen + workflow breakdown

### 4.1 Auth (`/login`, `/signup`, `/support`)

MikeOSS uses Supabase Auth — email confirmation (toggleable; disabled by default in local dev to dodge Supabase rate limits), sign-up, sign-in. Nothing legal-domain-specific.

**Mike-LQ:** keep LQ.AI's backend-owned auth ([ADR 0002](adr/0002-backend-owned-auth.md)) and OpenWebUI's existing auth screens; reskin to Mike's visual language only if desired. **Do not** introduce Supabase. The fresh-install bootstrap-password UX (M3-0.1 / DE-283) is the LQ.AI-specific addition here.

---

### 4.2 Assistant landing — empty state (`assistant/InitialView.tsx`)

The first thing a user sees on the Assistant tab with no active conversation:

- Centered serif **"Hi, {username}"** (display name, falling back to email).
- A 35px **MikeIcon** that animates apart from the greeting on load.
- A centered **ChatInput** composer (same component used in active chat) directly below.
- Small gray disclaimer: **"AI can make mistakes. Answers are not legal advice."**
- **No suggested-prompt chips** — deliberately minimal.

Submitting the first message calls `handleInitialSubmit` → creates a chat session → navigates to `/assistant/chat/{chatId}`.

**Mike-LQ:** trivial to replicate. Add LQ.AI's value signals _without clutter_ — the tier badge can live as a small chip near the composer; the disclaimer stays. Consider keeping it equally minimal; the restraint is part of the appeal.

---

### 4.3 Chat conversation (`assistant/chat/[id]/page.tsx` → `ChatView.tsx`) — the core surface

This is the heart of MikeOSS. Layout (`ChatView.tsx`):

- **Message list:** scrollable (`flex-1 overflow-y-auto`), centered `max-w-4xl`, `space-y-6` between messages, responsive padding.
- **Composer:** anchored `absolute bottom-0`, white, `rounded-t-[20px]`, with the **"AI can make mistakes. Answers are not legal advice."** disclaimer beneath it.
- **Auto-scroll:** scrolls to latest when ≥2 user messages exist; a manual "scroll to bottom" button appears when scrolled up.
- **Initial-load skeleton:** one user-bubble placeholder (2/5 width) + four shimmer assistant-line placeholders.
- **Document side panel** mounts conditionally to the right (see §4.4).

**User messages** (`UserMessage.tsx`): render content, attached files, and the selected workflow.

**Assistant messages** (`AssistantMessage.tsx`) — the rich surface:

- **Markdown** via ReactMarkdown + `remarkMath`/`rehypeKatex` (math) + `remarkGfm` (tables, etc.), **serif** font, styled h1–h4, lists, tables (responsive overflow, bordered, zebra rows), blockquotes, links.
- **Citations:** the model emits inline `[N]` markers. The renderer rewrites `[N]` → an internal `§idx§` token → an **inline circular pill** showing the citation number. Pills are gray (`bg-gray-100`), superscript-aligned, **clickable**. **Hover tooltip** shows `Page {n}: "{quote text}"`. Clicking fires `onCitationClick`, which opens the document side panel to that citation (§4.4).
- **Streaming + status:** a `MikeIcon` spins during streaming, flips to a checkmark on completion, red on error. Tool calls / reasoning blocks render with animated spinners and optional expandable content.
- **Actions** (appear after streaming ends): **Copy** (copies HTML + plain text, green checkmark feedback). **Edit cards** when the response contains tracked changes to a document — with **"Accept all" / "Reject all"** bulk buttons. **Download cards** for edited/created documents — filename, version badge, file-type icon, download button with async loading.
- **Error state:** custom inline error message.

**Composer** (`ChatInput.tsx`):

- **Textarea**, auto-growing to `max-h-48`, placeholder **"Ask a question about your documents..."**.
- **Attached chips** above the input: **workflow chip** (blue, Library icon, shows workflow title); **document chips** (black bg; red File icon for PDF, blue FileText for others; filename; X to remove).
- **Left button group:** Add Documents; **"Workflows"** (label shown ≥ md); **"Projects"** (label shown ≥ md, conditional).
- **Right button group:** **ModelToggle** dropdown (§4.7); action button = `ArrowRight` (idle) / `Square` (stop, while streaming).
- **Keyboard:** Enter submits; Shift+Enter newline. Submit disabled when empty or loading.
- **Three modals:** document selection, workflow/skill selection, API-key-missing.

**The MikeOSS chat workflow, end to end:**

1. User lands on Assistant (greeting + composer) or opens a project and clicks "New Chat."
2. Optionally attaches documents (from project or upload) and/or selects a workflow — these appear as chips.
3. Picks a model (or uses the default).
4. Types a question → Enter.
5. Assistant streams a serif markdown answer with inline citation pills.
6. User hovers a pill to preview the quote, clicks it to open the document side panel highlighted at that quote.
7. If the workflow produced redlines, user reviews Accept/Reject tracked changes and downloads the edited DOCX.

**Mike-LQ upgrade path — this is where LQ.AI is materially better:**

- The citation pill in Mike shows a _model-asserted_ page + quote. **In Mike-LQ the same pill is backed by the Citation Engine's 4-stage verification** — the pill carries a verification state (verified / tolerant / paraphrase / unverified / system-error) and a _character-verified_ offset, not just whatever the model claimed. Failed citations render as "unverified" (red) instead of confident-looking wrong text. This is the flagship differentiator; make the verification state visible in the pill, not buried.
- The composer's model picker is replaced by tier-aware routing: instead of "pick your model + supply your key," the user sees which **Inference Tier** their request will run at, with privileged-matter and tier-floor enforcement.
- Add the **Receipts drawer** (LQ.AI-only) as a right-rail panel — per-message provenance the Mike UI has no equivalent for.
- Anonymization: a small "Anonymized" indicator when the gateway pseudonymized entities before the request left for the provider.

---

### 4.4 Document side panel + citation highlighting (`AssistantSidePanel.tsx`, `DocPanel.tsx`, `DocView.tsx`)

A **tabbed, resizable** panel (min 300px, left-edge drag handle) that mounts to the right of the chat (desktop relative; mobile slide-in overlay from the right, body-scroll locked).

- **Three tab types:** document view (full doc), **citation** (a single quoted passage), tracked-changes (edits with accept/reject). Each tab labeled with filename + optional version badge ("V2").
- **Opening:** clicking a citation pill creates a new **CitationTab** with the citation's annotation, displayed via `DocPanel` in `"citation"` mode; "View" buttons on edit cards and download cards also open tabs.
- **Closing:** per-tab X, or "Close panel" (top right).
- **Scroll state** preserved per inactive tab.

**Document viewer** (`DocView.tsx`, PDF.js):

- Renders pages as canvas + overlaid text layer (selectable text).
- **Citation highlight:** highlights the quote on its hinted page; if not found there, scans all pages; then **scrolls to center the first highlight vertically**. Quote-finding logic in `highlightQuote.ts` (PDF) and `highlightDocxQuote.ts` (DOCX).
- **Zoom:** Ctrl+wheel / pinch / buttons, 0.5×–3.0×, 0.25× steps; persists across re-render.
- **Page tracking:** "current/total" bottom-left, zoom % bottom-right.
- DOCX rendered via `DocxView.tsx`.

**Mike-LQ upgrade:** LQ.AI's Document Pipeline already produces **character-level offsets** (Docling + PyMuPDF, [ADR 0006](adr/0006-document-pipeline-architecture.md)), so the highlight is _exact_ rather than a best-effort text scan — no "quote not found, scanning all pages" fallback needed. The citation tab becomes the natural home for the Citation Engine's verification-method chip and (for ensemble runs) the tier-envelope audit field.

---

### 4.5 Projects list (`projects/page.tsx` → `projects/ProjectsOverview.tsx`)

Header: serif **"Projects"** title; **"Search projects…"** input; **+** create button.

Tabs: **"All" / "Mine" / "Shared with me"**. An **"Actions"** dropdown appears when rows are selected.

Dense table, sticky name column. Columns: checkbox · **Name** (300px, sticky) · **CM** (CM/matter number) · **Files** · **Chats** · **Tabular Reviews** · **Created** · row menu.

Project fields: `id, name, cm_number, document_count, chat_count, review_count, created_at, is_owner, user_id`.

Actions: select (single/all), search (by name or CM number), **inline rename** (Enter/Escape), inline **CM number** edit, delete (single/bulk, **owner-only** — unauthorized triggers `OwnerOnlyModal`), click row → detail.

Empty state: serif "Projects" heading + **"Upload documents into projects and to commence chats and tabular reviews with them."** + "Create New". Loading: 3 skeleton rows. Error: **"Could not load projects."**

---

### 4.6 Project detail (`projects/[id]/page.tsx` → `projects/ProjectPage.tsx`)

Header: project name + optional `(CM number)`; **People** button (Users icon → `PeopleModal` for sharing); **"New Chat"** button; **"New Review"** button.

**Three tabs** (`ToolbarTabs`): **"Documents"** (default) · **"Assistant"** (chats) · **"Tabular Reviews"**.

**Documents tab:**

- **Folder tree** (`renderLevel()`): expandable folders (Chevron icons), alphabetical sort, documents nested or at root.
- Document rows: name + file icon · type · size · **version count** (click to expand version history) · created · updated · row menu.
- Toolbar: **"Add Subfolder"** (FolderPlus) · **"Add Documents"** (Upload → `AddDocumentsModal`) · **"Actions"** dropdown when selected: "Download" / "Remove from subfolder" / "Delete".
- Row actions (`RowActions.tsx`): "Rename document" (inline), Download, **"Show All Versions"**, **"Upload New Version"** (→ `UploadNewVersionModal`), Delete.
- **Drag-and-drop** to move docs/folders.

**Workflow:** "New Chat" → `saveChat(projectId)` → `/projects/{id}/assistant/chat/{chatId}` (project-scoped chat). "New Review" → `AddNewTRModal` (title + document selection + columns) → tabular review detail.

**Mike-LQ mapping:** this is LQ.AI's **matter workspace** (`/lq-ai/matters/[id]`), which already has files / skills / KBs / chats. Add Mike's folder-tree + version-history UX and the project-scoped "New Chat / New Review" entry points. LQ.AI's **privileged-matter toggle** and **tier-floor selector** live in this header — concepts Mike has no equivalent for, and which should be visually prominent (privileged is the highest-stakes signal).

---

### 4.7 Model picker (`assistant/ModelToggle.tsx`)

Button shows the selected model name + chevron (rotates 180° when open), `rounded-lg`, gray hover. Lists six models across three providers:

- **Anthropic:** "Claude Opus 4.7", "Claude Sonnet 4.6"
- **Google:** "Gemini 3.1 Pro", "Gemini 3 Flash"
- **OpenAI:** "GPT-5.5", "GPT-5.4 Mini"

Default: Gemini 3 Flash. Models without a configured API key are **grayed out** with an alert icon; a red `AlertCircle` shows on the trigger when the selected model's key is missing (title: "API key missing for selected model"). Selected available model shows a checkmark.

**Mike-LQ replacement (do not port the BYO-key model):** the gateway holds keys, so there is no per-user "key missing" state. Replace with **model aliases** (`/lq-ai/admin/models`) that the admin configures once, surfaced to the user as **Inference Tier** choices. The picker shows which alias/tier the request will use; tier-floor enforcement can disable choices that violate a privileged matter's floor (LQ.AI's `gateway/app/tier_floor.py`). The "key missing" alert becomes a "tier unavailable for this matter" affordance.

---

### 4.8 Tabular reviews list (`tabular-reviews/page.tsx`)

Header: **"Tabular Reviews"** · **"Search reviews…"** · **+** create.

Tabs: **"All" / "In Project" / "Standalone"** · **"Filter by project"** dropdown · "Actions" (when selected).

Table: checkbox · Name · **Columns** count · **Documents** count · Project · Created · row menu. Sticky header + name column. Inline rename. Owner-only delete (`OwnerOnlyModal`). Click row → review detail. Empty state with "Create New". 3 skeleton rows.

Create flow: modal with title + project + documents + columns config.

---

### 4.9 Tabular review grid (`tabular/TabularReviewView.tsx`, `TRTable.tsx`, `TabularCell.tsx`)

The differentiator surface — a **document × column matrix**:

- **Rows = documents** (searchable by filename). **Columns = extraction questions** with configurable format/prompt.
- **Cell** (`TabularCell`): extracted value + **status** (`pending` / `generating` / `done` / `error`) + **citations** (quote + page). Click a cell → **TRSidePanel** with full content, citation context, **"Regenerate"**, and column-navigation buttons.
- **"Add Columns"** → `AddColumnModal` → creates pending cells for every existing doc → `saveColumnsConfig()`.
- **"Add Documents"** (or drag files) → creates pending cells per doc×column → `updateTabularReview()`.
- **"Export"** → `exportTabularReviewToExcel()` (exceljs), disabled when empty.
- `TRChatPanel` — a chat/discussion panel attached to the review.
- Column presets + formatting in `columnPresets.ts` / `columnFormat.ts`; cell prompts auto-generated in `prompt-generator.ts`.

**Workflow:** create review → pick documents (rows) → add columns (questions) → cells auto-generate → click a cell to inspect value + citation in the side panel → regenerate any cell → export to Excel.

**Mike-LQ mapping:** this is **M3-C** (Tabular / Multi-Document Review), in flight on `main`. The LQ.AI version runs each cell as a **Citation-Engine-verified extraction** — cells that can't be answered render as "not found" with a verify affordance, _never_ as confident wrong text (per [M3-C2](M3-IMPLEMENTATION-PLAN.md)). Export ships server-side (M3-C4, openpyxl) with citation links in cell comments. The Mike-LQ branch rebases onto M3-C when it lands; the grid UX above is the visual target.

---

### 4.10 Workflows list (`workflows/page.tsx` → `workflows/WorkflowList.tsx`)

Header: serif **"Workflows"** · **"Search workflows…"** · **+**.

Tabs: **"All" / "Built-in" / "Custom" / "Hidden"**. "Actions" (when selected) · **"Filter by type"** (Tabular / Assistant) · **"Filter by practice"** (dynamic).

Table: checkbox · Name · **Type** (icon + "Tabular"/"Assistant") · **Practice** (or "—") · **Source** (**"Mike"** built-in / **"Myself"** / **"Shared by {name}"**) · Actions.

Actions: built-in → **"Hide"/"Unhide"**; custom (owner) → "Delete"; shared (non-owner) → none. Empty states per tab with "+ Create New".

Workflow object: `id, title, type (assistant|tabular), practice?, is_system, user_id, shared_by_name, is_owner`.

---

### 4.11 Workflow editor (`workflows/[id]/page.tsx`)

Breadcrumb: **"Workflows › {Title}"**. Inline-editable title (read-only for system workflows; **"Read-only"** badge).

**Two types:**

- **Assistant workflow** → `WorkflowPromptEditor`, a **WYSIWYG/rich-text** prompt editor, **auto-saved** (800ms debounce; **"Saving…"/"Saved"** indicator).
- **Tabular workflow** → column table: **"Column Title" / "Format" / "Prompt"**. Empty: **"Add columns to define what this tabular review workflow extracts from each document."** "Add Column" (Plus); per-column edit (click row) / delete (X); multi-select + "Actions" → "Delete".

Sharing: **People** button (Users icon → `ShareWorkflowModal`) for non-read-only workflows.

**What a "workflow" IS in Mike:** a reusable, named prompt (assistant type) or a reusable set of extraction columns (tabular type), optionally tagged by practice area, shareable to teammates, with built-in ones authored by "Mike."

**Mike-LQ mapping — this is the richest equivalence:**

- Mike "assistant workflow" (a saved prompt) ≈ LQ.AI **Skill** + **Saved Prompt**. LQ.AI skills are far deeper: versioned, audited, forkable, with a try-it sandbox and provenance pill, authored as readable work product ([PRD §7.1](PRD.md)). Mike's "Built-in / Custom / Shared" maps to LQ.AI's built-in vs community vs team skills.
- Mike "tabular workflow" (saved columns) ≈ LQ.AI **`output_format: table` skill** (M3-C1).
- Mike "practice area" tag ≈ skill category/frontmatter.
- LQ.AI adds what Mike lacks: **Playbooks** (codified legal positions with fallback tiers + redline strategies + severity), which have no Mike equivalent and are a strict superset of "assistant workflow."

So the Mike-LQ "Workflows" tab should unify Skills + Saved Prompts + Playbooks under Mike's IA, while preserving LQ.AI's transparency surfaces (versions, audit, try-it) one click from each item.

---

### 4.12 Account settings (`account/page.tsx`)

Sections: **Profile** (Display Name + Save; Organisation + Save, disabled until changed; read-only Email) · **Usage Plan** (tier, defaults "Free") · **Sign Out** · **Danger Zone** (two-step delete: "Delete Account" → confirm modal **"Permanently delete your account and all associated data. This action cannot be undone."** → Cancel / Delete Account).

Critically, MikeOSS's account page is also where **"Models & API Keys"** live (per the repo README) — per-user provider keys.

**Mike-LQ mapping:** Profile + sign-out + GDPR-aligned **export/deletion** already exist (`api/app/workers/user_export.py`, `user_deletion.py`). **Drop the per-user API-key section** (Decision MLQ-2); replace with read-only visibility into which model aliases/tiers the user can route to. Admin key management stays at the gateway/admin surface, not per-user.

---

## 5. Cross-cutting UX patterns to replicate

These recur across every Mike screen and are most of what makes it feel cohesive:

1. **Dense data tables** with sticky header + sticky first column, checkbox multi-select, a contextual **"Actions"** dropdown that appears only when rows are selected, and a per-row `RowActions` menu.
2. **Inline rename everywhere** (`RenameableTitle.tsx`) — click name, edit in place, Enter to save / Escape to cancel. Applies to projects, documents, folders, chats, reviews, workflows.
3. **Owner-only enforcement** — destructive actions check `is_owner`/`user_id`; unauthorized attempts open `OwnerOnlyModal` with an explanation rather than failing silently.
4. **Sharing** via `PeopleModal` / `ShareWorkflowModal` with `EmailPillInput` (email chips).
5. **Document versioning** — `VersionChip` ("V2"), "Show All Versions", "Upload New Version".
6. **Consistent empty states** — icon + serif heading + one-sentence description + "Create New".
7. **Consistent loading** — 3 skeleton rows for tables; shimmer lines for chat.
8. **Tabs via `ToolbarTabs`** — the same tab component drives Projects filters, Project-detail sections, Tabular filters, Workflows filters.
9. **Modals for creation/config** — never a separate full page for "create X"; always a modal (`modals/` + `shared/*Modal.tsx`).
10. **Search-as-filter** — every list header has a search box that filters client-side, case-insensitive.

A Mike-LQ build that nails these ten patterns will feel like Mike even before the per-screen details are perfect.

---

## 6. The transparency/traceability delta — make it visible, not hidden

MikeOSS's citation model is **model-asserted**: the LLM emits `[N]` with a page + quote, and the UI trusts it (the highlight logic even scans all pages when the quote isn't where the model said it was — an implicit admission the model can be wrong about location). There is no verification, no audit, no anonymization, no tier awareness.

LQ.AI's entire reason for existing is that this gap is unacceptable for legal work. The Mike-LQ frontend should **surface** the following everywhere Mike would simply show a citation pill:

| Mike-LQ surface                                                                 | Backing                                                                                                      | Where it shows                              |
| ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ | ------------------------------------------- |
| Citation **verification state** (verified/tolerant/paraphrase/unverified/error) | Citation Engine 4-stage cascade ([`api/app/citation/verification.py`](../api/app/citation/verification.py))  | the citation pill itself + the citation tab |
| **Character-exact** highlight (no "scanning all pages")                         | Document Pipeline offsets ([ADR 0006](adr/0006-document-pipeline-architecture.md))                           | document side panel                         |
| **Inference Tier** badge                                                        | gateway tier routing ([PRD §3.13](PRD.md#313-inference-tier-awareness))                                      | composer + message + redline pane           |
| **Anonymization** indicator                                                     | gateway middleware ([`gateway/app/anonymization/middleware.py`](../gateway/app/anonymization/middleware.py)) | message metadata                            |
| **Receipts** (per-event provenance)                                             | `api/app/api/chat_receipts.py`                                                                               | right-rail drawer (no Mike equivalent)      |
| **Privileged matter** carve-out                                                 | `Project.privileged` + tier floor                                                                            | matter header (unmistakable badge)          |
| **Skill version + audit + try-it**                                              | DB-backed user skills ([ADR 0012](adr/0012-db-backed-user-skills.md))                                        | workflow/skill detail                       |
| **Audit log** of sensitive actions                                              | `api/app/audit.py`                                                                                           | admin                                       |

The design principle: **Mike hides the model's fallibility; Mike-LQ shows it honestly.** A red "unverified" pill is a feature, not a regression — it is the difference between a tool a lawyer can rely on and one they cannot.

---

## 7. Build guidance for the implementing agent

1. **Start from the existing `/lq-ai/*` SvelteKit routes**, not a blank slate. Every Mike screen has an LQ.AI counterpart that already talks to the backend. The job is reskin + IA alignment + the redline pane, per [`mikeoss-frontend-scope.md`](mikeoss-frontend-scope.md) W1–W3.
2. **Do not copy MikeOSS source** — it is AGPL-3.0. Replicate _behavior and visual language_ from this breakdown; write original Svelte.
3. **Token layer first** (scope doc W1-1): serif headings + body, gray palette, generous rounding, the semantic accent colors (blue workflow / red PDF+error / green success). Everything else inherits from it.
4. **Replicate the ten cross-cutting patterns (§5) once**, as shared components, before doing per-screen work — they're 70% of the feel.
5. **Swap the BYO-key model for tier-awareness** everywhere it appears (§4.7, §4.12). This is the one place a literal port would actively harm the product.
6. **Treat citations as the hero.** Mike's pill is a nice touch; Mike-LQ's verified pill is the entire value proposition. Spend disproportionate effort on the pill ↔ side-panel ↔ verification-state interaction.
7. **Rebase onto M3 as it lands** — Tabular (§4.9) and server-side XLSX export come from M3-C; the Word redline path is M4/community. The browser TipTap redline pane (scope doc W2) is the Mike-LQ-specific complement.
8. **Confirm against the video + live site** the things the source can't tell you: exact sidebar ordering, onboarding flow, any motion/polish on `mikeoss.com` that the OSS source omits.

---

## 8. Open items to verify with a human (source couldn't answer)

- Exact **sidebar nav order + labels + icons** (`AppSidebar.tsx` was not fully read; destinations inferred from routes).
- The **onboarding / first-run** flow (post-signup) — not visible in the pages read.
- Any **suggested-prompt or example-gallery** surface shown in the marketing video but absent from `InitialView.tsx`.
- The **`/support`** page contents.
- Whether the marketing site shows features beyond the OSS source (the OSS repo is the floor, not necessarily the ceiling of what `mikeoss.com` advertises).

---

_Reconstructed from `github.com/willchen96/mike@main` source. Pin the reference SHA before building. Pairs with [`mikeoss-frontend-scope.md`](mikeoss-frontend-scope.md)._
