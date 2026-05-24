# Donna — Foundation + Auth + Assistant Landing (P0 + P1) Design

> **Status:** Approved design (brainstorming output). Implementation contract for the first build slice.
> **Date:** 2026-05-24
> **Scope of this spec:** Phase P0 (Foundation) + Phase P1 (Auth + Assistant landing). The remaining phases (P2–P8) are sketched in §3 for context but are **not** specified here — each gets its own spec → plan → implement cycle.

---

## 1. Context

Donna is a **standalone application** that delivers a [MikeOSS](https://github.com/willchen96/mike)-inspired user experience on top of the **LQ.AI** backend ([LegalQuants/lq-ai](https://github.com/LegalQuants/lq-ai)). It lives in its own repo ([LegalQuants/Donna](https://github.com/LegalQuants/Donna)).

Three properties define Donna and distinguish it from the two reference projects:

- **Backend leverage, not fork-and-diverge.** Donna *vendors* the lq-ai backend (`api` + `gateway` + supporting services) as a pinned dependency and talks to it **only** through its two published OpenAPI contracts. Donna does not modify lq-ai source.
- **Fresh frontend, MikeOSS-inspired.** The frontend is written from scratch in **SvelteKit**. No MikeOSS code is copied (MikeOSS is AGPL-3.0; we replicate *behavior and visual language*, not source). lq-ai's own SvelteKit `web/` shell is **not** reused either.
- **Verified substance under a familiar surface.** Donna presents MikeOSS's recognizable IA while surfacing lq-ai's differentiators that MikeOSS lacks: character-verified citations, anonymization, inference-tier awareness, audit, and skill transparency.

### 1.1 Relationship to the existing scope docs

`mikeossfrontendscope.md` and `mikeossuxbreakdown.md` (in the repo root) were written for an **in-repo reskin branch of lq-ai** — their locked Decision **MLQ-1** is "stay in SvelteKit and reskin lq-ai's existing `/lq-ai/*` routes in place." **This spec supersedes MLQ-1.** Donna is a separate app, not an in-repo reskin. Those documents are retained as a **UX/behavior reference** (the screen-by-screen breakdown remains the authoritative description of the target *feel*), but they are no longer the build target. Where they describe editing `web/src/routes/lq-ai/**`, read instead "build the equivalent surface fresh in Donna's SvelteKit app."

### 1.2 What the backend provides (verified)

The lq-ai backend is a monorepo deployed via docker-compose. Relevant facts confirmed against the source at planning time:

- **API base path:** `/api/v1` (FastAPI). Two OpenAPI specs: `docs/api/backend-openapi.yaml` (app API) and `docs/api/gateway-openapi.yaml` (inference gateway).
- **Auth model:** username/password → **JWT access token** (`Bearer`) + **opaque, rotating refresh token**; optional **TOTP MFA**. Endpoints: `POST /api/v1/auth/login`, `/auth/refresh`, `/auth/logout`, `/auth/mfa/verify` (+ setup/enable/disable), `/auth/change-password`. Current user via `GET /api/v1/users/me`. First-run bootstrap-password via the `bootstrap` route.
- **CORS:** configurable (`LQ_AI_CORS_ORIGINS`); the backend explicitly expects to run **behind a reverse proxy** with CORS unset in that topology.
- **Backend services (docker-compose):** `postgres` (pgvector), `redis`, `minio`, `gateway`, `api`, `ingest-worker`, `arq-worker`, plus optional `ollama`, `paddleocr`, `slack-bridge`, `teams-bridge`, and lq-ai's own `web` (which Donna replaces).
- **API surface ↔ Donna surface** (full app, for context): `auth`/`bootstrap` → auth; `chats`/`chat_receipts` → chat; `inference`/`inference_override`/`models` → tier; `enhance_prompt` → Enhance Prompt; `files`/`knowledge_bases` → files/KBs; `projects` → matters; `skills`/`user_skills`/`saved_prompts`/`playbooks` → workflows; `tabular` → tabular review; `organization_profile`/`users` → settings; `admin` → audit/admin.

---

## 2. Architecture

```
┌──────────────────────────── Donna repo ─────────────────────────────┐
│                                                                      │
│  Browser ──https──▶ SvelteKit server (BFF)  ──Bearer──▶ lq-ai api    │
│   (no JWT,          • httpOnly cookies hold tokens       (:8000)     │
│    same origin)     • hooks.server attaches Bearer       /api/v1     │
│                     • refresh-on-401, SSE pass-through               │
│                                                          lq-ai       │
│                                                          gateway     │
│  vendor/lq-ai  (git submodule, pinned SHA) ── built by docker-compose│
└──────────────────────────────────────────────────────────────────────┘
```

**The single load-bearing decision is the BFF (backend-for-frontend) proxy.** Donna's SvelteKit server is the *only* thing that talks to the lq-ai api. The browser is same-origin to the SvelteKit server, so:
- there is **no CORS** to configure (matches lq-ai's "behind a reverse proxy" expectation),
- the **JWT never reaches client JavaScript** (tokens live in httpOnly cookies, read only server-side),
- a single chokepoint handles **refresh-token rotation** and (in P2) **SSE stream pass-through**.

---

## 3. Phase roadmap (context only — not all specified here)

| Phase | Deliverable |
|---|---|
| **P0 — Foundation** *(this spec)* | Scaffold, backend wiring (submodule + compose), design tokens, primitives, typed API client, BFF auth session, global app shell |
| **P1 — Auth + Assistant landing** *(this spec)* | Login/signup/bootstrap/MFA; collapsible app shell; serif "Hi, {name}" landing + composer; create-and-route a new chat |
| P2 — Chat hero + verified citations ⭐ | Message list, streaming composer, 5-state verified citation pills, tier badge, anonymization indicator, Receipts drawer |
| P3 — Document panel + highlighting | Tabbed resizable PDF.js/DOCX viewer, character-exact citation highlight |
| P4 — Projects / Matters | List + detail, folder tree, versions, privileged toggle, tier-floor, sharing |
| P5 — Workflows | Unified Skills + Playbooks + Saved Prompts IA with transparency surfaces |
| P6 — Tabular review | Doc×column grid, per-cell citations, export |
| P7 — Settings / Account / Trust | Profile, tier visibility (no BYO keys), export/deletion, Trust page |
| P8 — TipTap redline pane | Read-only tracked-changes Svelte editor |

P0 is the only hard blocker. P0→P1→P2 is the "hero thread" that proves the thesis end-to-end.

---

## 4. P0 — Foundation

### 4.1 Repository structure

```
Donna/
├─ src/
│  ├─ routes/                # SvelteKit routes (incl. BFF +server endpoints & form actions)
│  ├─ lib/
│  │  ├─ design/             # tokens.ts + design primitives wrappers
│  │  ├─ components/         # shared UI (shell, composer, etc.)
│  │  ├─ server/             # server-only: api client, auth/session, cookie helpers
│  │  └─ api/                # generated OpenAPI types (openapi-typescript output)
│  ├─ hooks.server.ts        # session + Bearer attach + refresh-on-401
│  └─ app.html · app.css · app.d.ts
├─ static/                   # Donna wordmark/mark, favicons
├─ vendor/lq-ai/             # git submodule, pinned SHA (recorded in docs/)
├─ docker-compose.yml        # lq-ai backend services + Donna web; lq-ai web omitted
├─ docs/
│  ├─ superpowers/specs/     # this spec and successors
│  └─ decisions/             # short ADR-style notes (pinned SHA, primitive choice, etc.)
├─ tests/                    # Playwright e2e
├─ svelte.config.js · vite.config.ts · tailwind.config.ts · tsconfig.json
├─ playwright.config.ts · vitest.config.ts
├─ .env.example
└─ package.json
```

### 4.2 Backend wiring

- **Submodule:** add `LegalQuants/lq-ai` at `vendor/lq-ai`, pinned to a captured `main` SHA. Record the SHA + capture date in `docs/decisions/lq-ai-pin.md` (so the UX-breakdown reference and the build target the same backend version).
- **docker-compose.yml** (Donna-owned) brings up, building from `vendor/lq-ai/`:
  - **Default profile:** `postgres`, `redis`, `minio`, `gateway`, `api`, `ingest-worker`, `arq-worker`, and Donna's **`web`** (SvelteKit, the only service built from Donna source).
  - **Omitted:** lq-ai's own `web` service.
  - **Optional profiles:** `ollama` (profile `local-inference`), `paddleocr` (profile `ocr`), `slack-bridge`/`teams-bridge` (profile `bridges`). Heavy/optional for day-to-day frontend dev.
- **Env:** Donna `.env.example` documents the SvelteKit-side vars (`LQ_API_INTERNAL_URL` pointing at the `api` service, cookie secret/flags, session TTLs). Backend env continues to be driven by lq-ai's own `.env`/compose conventions from the submodule.
- **Dev ergonomics:** a developer can either (a) `docker compose up` the whole stack, or (b) run the SvelteKit dev server on the host against the compose-hosted `api`. Both must work; the BFF reads `LQ_API_INTERNAL_URL`.

### 4.3 Frontend substrate

- **Design tokens** (`src/lib/design/tokens.ts` + `tailwind.config.ts` theme extension) capturing the MikeOSS language:
  - **Typography:** serif for **both** headings and body (`--font-serif`) — the single most recognizable MikeOSS trait; a sans fallback stack for UI chrome where serif harms legibility (small labels, dense tables).
  - **Palette:** white surfaces; restrained grays (surface, subtle border, muted text, primary text); semantic accents — **blue** = workflow/skill, **red** = PDF/error, **green** = success, **black** = document chip. A reserved high-contrast **privileged** token (used from P4; defined now).
  - **Shape:** generous rounding — composer `rounded-t-[20px]`, buttons `rounded-lg`, citation pills fully rounded.
  - **Motion:** staggered landing entrance (~900ms cubic-bezier), shimmer skeleton (`shimmer` keyframe), streaming spinner→checkmark (used from P2; keyframes defined now).
- **Primitives:** **bits-ui** (chosen over melt-ui for higher Radix-API parity) + **lucide-svelte** icons. Wrap the primitives we need behind `src/lib/design/` so swapping is localized.
- **Typed API client:** generate TypeScript types from `vendor/lq-ai/docs/api/backend-openapi.yaml` and `gateway-openapi.yaml` using **openapi-typescript** into `src/lib/api/`. A thin typed fetch wrapper (`src/lib/server/lqClient.ts`) consumes those types and is **importable only from server code**.
- **Testing:** **Vitest** (unit/component) + **Playwright** (e2e). Lint/format via the SvelteKit-standard ESLint + Prettier + `svelte-check`.

### 4.4 BFF auth & session (load-bearing)

- **Cookies:** `donna_at` (access JWT) and `donna_rt` (refresh token), both `httpOnly`, `secure`, `sameSite=lax`, path `/`. TTLs mirror the backend's access/refresh TTLs. Tokens are **never** sent to the client bundle or exposed via `+page.ts` `load` data.
- **`hooks.server.ts` `handle`:** on each request, read `donna_at`; populate `event.locals.user` (decode JWT claims, or call `GET /users/me` when locals are cold). Unauthenticated requests to protected routes redirect to `/login`.
- **Server fetch wrapper (`lqClient`):** attaches `Authorization: Bearer <donna_at>`. On `401`, attempts **one** `POST /auth/refresh` with `donna_rt`; on success, writes the rotated `donna_at`/`donna_rt` cookies and retries the original request once; on failure, clears cookies and surfaces an auth error (→ redirect to `/login`).
- **SSE readiness:** the wrapper exposes a streaming pass-through mode so P2's `POST /chats/.../messages` SSE can be proxied through a SvelteKit `+server` endpoint without buffering. (Defined in P0; first consumed in P2.)
- **Login/logout flows:** SvelteKit **form actions** (progressive-enhancement friendly) call `/auth/login` (+ `/auth/mfa/verify` when challenged) and `/auth/logout`, setting/clearing cookies server-side.

### 4.5 Global app shell

- Two-column responsive layout: **collapsible left sidebar** + full-height main column.
- **Sidebar:** Donna wordmark; primary nav — **Assistant** (`/`), **Projects** (`/matters`), **Workflows** (`/workflows`), **Tabular** (`/tabular`); a recent-chats list region (populated from `chats` list; empty-state-friendly in P1); account/footer entry. Open/closed state **persisted to `localStorage`**; auto-collapses below the 768px breakpoint via a resize listener.
- **Mobile header** (`<768px`) with a panel-toggle icon.
- Nav destinations for P2–P8 surfaces render a tasteful "coming soon"/empty placeholder in this slice so the shell is navigable without dead links.

---

## 5. P1 — Auth + Assistant landing

### 5.1 Auth screens

- **Login** (`/login`): email + password; MikeOSS visual language. Submits to a form action → `/auth/login`. On MFA challenge, reveal a TOTP code step → `/auth/mfa/verify`. On success, set cookies, redirect to `/`.
- **Bootstrap / forced password change** (first-run): **Resolved during planning** — lq-ai exposes **no `/auth/signup`**; account creation is admin-side, and first-run is the `must_change_password` flag (authed endpoints return `403 password_change_required` until `POST /auth/change-password` succeeds). So P1 has **no public signup page**; instead a forced password-change screen is surfaced whenever the session reports `must_change_password`.
- **Logout:** clears cookies via `/auth/logout`, redirects to `/login`.
- Errors render inline (invalid credentials, locked, MFA-required, network) — no silent failures.

### 5.2 Assistant landing (empty state)

- Centered serif **"Hi, {display name}"** (falls back to email local-part).
- A Donna mark that animates apart from the greeting on load (staggered entrance from the token motion set).
- The shared **composer** centered below (the same composer component the chat surface will reuse in P2 — in P1 it needs only: autogrowing textarea, placeholder "Ask a question about your documents…", Enter-submits/Shift+Enter-newline, send button).
- Gray disclaimer beneath: **"AI can make mistakes. Answers are not legal advice."**
- **No suggested-prompt chips** (deliberately minimal, per the reference).
- **Submit behavior:** create a chat (`POST /api/v1/chats` via the BFF) and navigate to `/chats/{id}`, carrying the first message. The chat conversation view itself is **P2**; P1 delivers create-and-route and a minimal placeholder chat route that confirms the chat exists.

---

## 6. Error handling

- **Auth/session:** 401 → single transparent refresh+retry → on failure, clear cookies + redirect to `/login` with a flash message. 403 (e.g., tier/permission) surfaces a readable inline message.
- **Backend unreachable:** the BFF returns a styled 502/error page distinguishing "backend down" from "you're logged out."
- **Form validation:** client + server validation on auth forms; server is authoritative.
- **No leaking internals:** backend error bodies are mapped to user-safe messages; raw stack traces never reach the browser.

---

## 7. Verification — "the slice is done"

1. `npm run check` (svelte-check) and lint pass with 0 errors.
2. `vitest run` passes (unit/component tests for tokens, cookie/session helpers, composer behavior, sidebar persistence).
3. `docker compose up` brings up the default-profile stack (lq-ai backend services + Donna web) with no manual steps beyond `.env`.
4. **Playwright e2e** against the real lq-ai `api`:
   - logs in with valid credentials and lands on the assistant greeting;
   - rejects invalid credentials with an inline error;
   - submits a first message and asserts a chat is created and the app routes to `/chats/{id}`;
   - toggles the sidebar and asserts persistence across reload.
5. **No JWT in client:** an e2e/inspection check confirms `donna_at`/`donna_rt` are httpOnly and never appear in client-readable storage or page data.
6. Manual: the login screen, app shell, and assistant landing read as the same product family as MikeOSS (serif, restrained gray, generous rounding).

---

## 8. Out of scope (this slice)

- The chat conversation surface, streaming, citation pills, tier badge, anonymization indicator, Receipts drawer (**P2**).
- Document side panel / PDF.js / highlighting (**P3**).
- Projects/Matters, Workflows, Tabular, Settings/Trust, redline pane (**P4–P8**).
- Modifying any lq-ai source; adding backend endpoints.
- Per-user BYO model keys (never — gateway is the sole key-holder).
- Pushing to / configuring the GitHub remote (left to a separate, explicitly-authorized step).

---

## 9. Decisions log

| # | Decision | Rationale |
|---|---|---|
| D-1 | Donna is a **standalone app**, not an in-repo lq-ai reskin (supersedes MLQ-1) | User directive; own repo `LegalQuants/Donna` |
| D-2 | **Bundle** lq-ai backend via **git submodule + Donna docker-compose**; consume only via OpenAPI | "Leverage the backend," deploy as one product, no fork divergence |
| D-3 | Frontend built fresh in **SvelteKit** (not Next.js, not lq-ai's `web/`) | User choice; same framework family as lq-ai; MikeOSS patterns translated, not copied |
| D-4 | **BFF proxy** with httpOnly-cookie tokens; no CORS, no browser-held JWT | Matches lq-ai's reverse-proxy expectation; security; single chokepoint for refresh + SSE |
| D-5 | **bits-ui** primitives + **lucide-svelte** | Higher Radix-API parity than melt-ui |
| D-6 | **openapi-typescript** generated client, server-only | Two published OpenAPI contracts are the source of truth |
| D-7 | **Vitest + Playwright** | Modern SvelteKit-native test stack |

---

## 10. Open questions / assumptions to confirm during planning

1. ~~**Signup exposure:**~~ **RESOLVED** — no `/auth/signup`; account creation is admin-side and first-run is the `must_change_password` forced rotation. No public signup page (see §5.1).
2. **lq-ai pin SHA:** capture the exact `main` SHA at submodule-add time (D-2 / `docs/decisions/lq-ai-pin.md`).
3. **Compose build contexts:** confirm lq-ai's service `build:` contexts resolve cleanly when referenced from `vendor/lq-ai/` in Donna's compose (vs. needing lq-ai's own compose as a base via `extends`/`-f`).
4. **`GET /users/me` claim shape:** confirm the fields needed for `event.locals.user` and the landing greeting (display name vs. email).
5. **Markdown/KaTeX pipeline** (P2, noted now): pick the Svelte markdown renderer when P2 is specified.
