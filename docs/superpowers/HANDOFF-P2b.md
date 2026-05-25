# Donna — Handoff for the next session (start P2b)

**Date:** 2026-05-24 · **Branch state:** `main` has P0+P1 (PR #1) and P2a (PR #2) merged. Start P2b from `main`.

---

## 1. What Donna is

A standalone, MikeOSS-inspired **SvelteKit (Svelte 5)** frontend for the **lq-ai** legal-AI backend. The browser talks only to Donna's SvelteKit server (a **backend-for-frontend**) which holds the lq-ai JWT in **httpOnly cookies** and proxies to the lq-ai `api`. The lq-ai backend is vendored at `vendor/lq-ai` (pinned submodule) and brought up by this repo's `docker-compose.yml`. Visual language: document-forward, serif, restrained grays. No MikeOSS source copied.

Read these to orient: `README.md`, `docs/superpowers/specs/2026-05-24-donna-foundation-auth-design.md` (P0+P1 + the full roadmap), `docs/superpowers/specs/2026-05-24-donna-p2a-streaming-chat-design.md` (P2a), `docs/decisions/lq-ai-pin.md` (submodule pin, compose mechanism, gateway alias, known follow-ups), and the reference docs `mikeossuxbreakdown.md` §4.3–4.4 + §6 (citation UX) / `mikeossfrontendscope.md`.

## 2. Phase status & roadmap

| Phase | Status |
|---|---|
| P0 Foundation, P1 Auth+Landing | ✅ merged (PR #1) |
| **P2a Core streaming chat** | ✅ merged (PR #2) |
| **P2b Verified citation pills** | ⬅️ **NEXT** |
| P2c Provenance & composer power (receipts, anonymization indicator, skill-attach, Enhance Prompt, model/tier picker) | pending |
| P3 Document panel + citation highlighting | pending |
| P4 Projects/Matters · P5 Workflows · P6 Tabular · P7 Settings/Trust · P8 Redline pane | pending |

## 3. How to build a phase (established workflow — follow it)

Per-phase loop, **one phase per PR**: brainstorming (offer the visual companion for UI questions) → write spec to `docs/superpowers/specs/` → writing-plans → **subagent-driven-development** (fresh implementer per task + spec & code-quality review; **commit per task and push regularly**) → **live e2e verification** against the running stack → final whole-branch review → finishing-a-development-branch (open PR). **Feature-branch-in-place** (no worktrees). Quality bar: `npm run check` = **0 errors, 0 warnings** (the vendor `ERR_MODULE_NOT_FOUND` stderr is harmless; exit 0 is the signal).

## 4. Running / verifying the stack

Donna runs as compose project `donna` on **shifted ports** (the user runs their own lq-ai on the defaults). Everything is in the gitignored `.env` (recreate from `.env.example` if missing; the `ANTHROPIC_API_KEY` must be re-supplied by the user).

```bash
# from repo root, with .env present
set -a; . ./.env; set +a
docker compose up -d --build postgres redis minio gateway api donna-web
# after editing .env:    docker compose up -d --force-recreate gateway
# after editing src/:    docker compose up -d --build donna-web
# one-time login fixture (admin@lq.ai / DonnaE2ePassw0rd!):
docker compose exec api python -m app.cli reset-admin-password --email admin@lq.ai --password "$DONNA_E2E_PASSWORD" --no-force-change
npm run check && npx vitest run && npx playwright test   # app at http://localhost:13002
```

## 5. P2b scope — verified citation pills (the flagship differentiator)

Layer interactive, verification-stated citation pills onto the existing P2a chat surface. **In P2a, citation markers render as plain text; P2b makes them live.**

**Verified backend contract (from `vendor/lq-ai/docs/api/backend-openapi.yaml`):**
- The model emits inline markers of the form `"<quote>" (Source: [N])`; **`[N]` maps to `citations[N-1]`** (1-indexed). The citation-engine doc (`vendor/lq-ai/docs/citation-engine.md`) confirms rendering an unverified marker red.
- `Citation = { id, source_file_id, source_offset_start, source_offset_end, source_page?, source_text, verified: boolean, partial: boolean }`. **No method/state enum** — derive the UI state:
  - `verified && !partial` → **verified** (green)
  - `verified && partial` → **verified-with-caveats** (yellow)
  - `!verified` → **unverified** (red)
- **Where citations already are:** the SSE `complete` frame carries `citations[]`, and P2a's `chatStream` already stores them on the assistant message (`ChatMessage.citations` — currently unused). So for freshly-streamed messages, citations are already client-side.
- **Gap to handle:** `GET /chats/{id}/messages` (history load) does NOT include citations inline. For reloaded history, fetch per message via `GET /api/v1/chats/{id}/messages/{message_id}/citations` → `Citation[]` (through a BFF endpoint / the `load`), and attach to `ChatMessage.citations`.

**Likely work (decompose during brainstorming):**
- Type `ChatMessage.citations` properly (currently `unknown[]`); generate/derive a `Citation` type from `$lib/api/backend`.
- A pill-rendering layer: parse the assistant content for `[N]` markers and replace them with an interactive `CitationPill` component bound to `citations[N-1]`. **Note:** P2a renders content via `Markdown.svelte` (`markdown-it` + `{@html}` sanitized). Decide how pills interleave with sanitized HTML — e.g. a post-render token-replacement on the sanitized output, or a markdown-it rule, or splitting content around markers and rendering pills as Svelte components. Keep sanitization intact (DOMPurify stays authoritative).
- Pill states (3, above), hover tooltip = `source_text` + `Page {source_page}`. Click → lightweight popover in P2b (the full document side panel + offset highlighting is **P3**).
- Citations for history-loaded messages (the gap above).
- This is a UI-heavy phase → **use the visual companion** for pill design (colors/states, tooltip, marker treatment).

## 6. Key files (P2a surface P2b builds on)

- `src/lib/chat/sse.ts` — SSE frame parser (`complete` frame includes `citations`).
- `src/lib/chat/chatStream.svelte.ts` — runes controller; `ChatMessage` interface (has `key`, `id`, `content`, `routed_inference_tier`, `status`, `error`, `citations`); `send`/`retry`/`stop`.
- `src/lib/components/Message.svelte` — renders user chip vs assistant `Markdown`; **where pills get wired in**.
- `src/lib/components/Markdown.svelte` — sanitized serif markdown (`markdown-it` html:true + `isomorphic-dompurify`). Sanitization is security-critical — don't regress it.
- `src/routes/(app)/chats/[id]/+page.server.ts` — history `load` (where you'd also fetch citations for history).
- `src/routes/(app)/chats/[id]/messages/+server.ts` — BFF SSE proxy (pattern to mirror for a citations BFF endpoint).
- `src/lib/server/lqClient.ts` — `lqFetch` (authed, refresh-on-401) + `lqStream`.

## 7. Open follow-ups (from reviews; not P2a blockers)

Recorded in `docs/decisions/lq-ai-pin.md`:
- **Chat→chat in-place navigation** isn't handled — the chat controller seeds once (`untrack`). When sidebar "recents" / direct chat switching lands, wrap the conversation in a child component keyed by `chatId` so the controller re-initializes.
- **Backend-down vs logged-out:** `hooks.server.ts` treats any non-200/403 from `/users/me` as logged-out, and `auth.login` collapses a 500 into "invalid credentials." Distinguish "backend unavailable" (503) from "auth invalid."
- **Refresh-cookie TTL** is 8h while lq-ai's refresh token default is 7d — align when session UX is revisited.
- **Deploy beyond localhost** needs TLS in front of `donna-web` (production cookies are `Secure`).

## 8. Gotchas

- Icons: `@lucide/svelte` (NOT the deprecated `lucide-svelte`). Route in Svelte 5: `$app/state`'s `page` (NOT `$app/stores`).
- `vendor/` is excluded from svelte-check/ESLint/Prettier; the generated API types live in `src/lib/api/` (regenerate with `npm run gen:api`, which sanitizes an upstream YAML backtick bug via `scripts/sanitize-openapi.js`).
- Clone with `--recurse-submodules` (or `git submodule update --init`).
