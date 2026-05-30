# Donna — Skill-inputs slice v1: applied-skills confirmation + upstream request

**Date:** 2026-05-29 · **Branch:** `applied-skills-confirmation` · **PR target:** `main` · **Backend pin:** `438198c` (no backend change for the shippable half)

## 1. Background & the spike that reshaped this slice

The roadmap's next "apply skills properly" slice was scoped (in `HANDOFF-skill-inputs.md`) as: collect a skill's declared inputs in the composer, thread `MessageCreate.skill_inputs`, and surface `applied_skills`. A live spike against the running stack (pin `438198c`, 2026-05-29) found the input-collection half is **premature against today's backend**:

1. **`skill_inputs` only interpolates into `{{placeholder}}`-templated skill bodies.** Proven live: a user-skill whose body was `"…haiku about {{topic}} in the style of {{style}}…"` with `{topic, style}` bound produced a real haiku; the same skill with no binding replied "I need a topic and style." The gateway assembler (`gateway/app/skills/assembler.py`) substitutes only `{{name}}` placeholders and **silently drops any bound input the body doesn't reference** (its own docstring: "surplus inputs the body never references are tolerated").
2. **None of the 14 built-in skills are templated** — they're written as conversational prose ("paste it in"). So binding inputs to any current built-in is a no-op. Proven live: `comms-improver` with `text`+`audience` bound still replied "I don't see any text to rewrite."
3. **Required inputs are not enforced server-side** for built-ins — `contract-qa` sent with zero inputs returned `200`; the model just asks conversationally. So client-side required-gating would be a UX nicety, not a correctness gate.
4. **Live input-type taxonomy is only `text`, `document`, `structured`** — zero `enum`/`boolean`/`integer`/`file`, zero defaults. The "one of a/b/c" choices live in *description prose*, not machine-readable `enum[]`. `document` is RAG/file-resolved (binding it as text had no effect); `structured` is system-populated (only on `enhance-prompt`).

Conclusion (confirmed with the user): a composer input form built today would collect values that silently vanish — a UX lie. Meanwhile `applied_skills` confirmation is real, working, and on-thesis. **This slice ships the confirmation and files an upstream request to make `skill_inputs` meaningful for the corpus. The composer input form is deferred until that lands.**

## 2. Goal

When an assistant turn used one or more skills, show a quiet, friendly footer line confirming which ones — for both freshly streamed turns and reloaded history. Plus: write the upstream request that unblocks the deferred input-form work.

## 3. Scope

**In scope**

- Capture `applied_skills` from the SSE stream and from history rows onto the assistant `ChatMessage`.
- Render a quiet footer confirmation on `done` assistant turns: `[ScrollText icon] Applied: Contract QA, NDA Review` with each label prettified from its slug and linked to `/skills`. (The icon is the lucide `ScrollText` — the same one used for the Skills nav entry — not a literal `✦` glyph; see §6.)
- A pure `prettifySkillSlug` helper with an acronym map.
- `docs/upstream-requests/lq-ai-skill-inputs-corpus.md`.

**Out of scope (deferred)**

- Composer input form / `skill_inputs` threading (premature — see §1).
- `type: 'file'` / `document` binding (upstream-blocked: `docs/upstream-requests/lq-ai-chat-message-file-attach.md`).
- `slash_unresolved` hints; landing-composer parity for applied-skills (works automatically via history once a turn exists, but no special landing treatment).
- Resolving exact backend `display_name`s (we prettify the slug instead — chosen for zero coupling/fetch).

## 4. Data flow (no new BFF endpoint)

Mirrors the existing per-turn metadata (`routed_inference_tier`, `anonymized`).

- **`ChatMessage`** (`src/lib/chat/chatStream.svelte.ts`): add `applied_skills?: string[]`.
- **Streaming:** `applyFrame` captures `frame.applied_skills` on the `delta` branch (verified: every delta frame carries the full array) → `m.applied_skills = frame.applied_skills`. `sse.ts` already types `applied_skills?: string[]` on the `delta` frame. **Defensively** also read it off the `complete` frame: extend the `complete` frame type in `sse.ts` so `message` includes `applied_skills?: string[]`, and in `applyFrame`'s `complete` branch set `m.applied_skills = frame.message.applied_skills ?? m.applied_skills`.
- **History:** in `src/routes/(app)/chats/[id]/+page.server.ts` (the `page.items.map(...)` that builds `ChatMessage[]`, ~line 23), add `applied_skills: m.applied_skills`. History rows carry the field directly (verified — the assistant row includes `applied_skills`).
- **Retry:** `reset()` in `chatStream.svelte.ts` clears `applied_skills` alongside `routed_inference_tier`/`anonymized` so a retried turn re-derives it from the new stream.

Empty/absent `applied_skills` (most non-skill turns) → field is `undefined`/`[]` → nothing renders.

## 5. Prettify helper

New `src/lib/skills/skillLabel.ts`:

```
export function prettifySkillSlug(slug: string): string
```

- Split on `-`, drop empties, title-case each word, upcase any word in an acronym set: `MSA, NDA, DPA, QA, SAAS→SaaS, SOW, BAA, GDPR`. (The set is a small constant map from lowercased word → display form; words not in the map get simple title-case.)
- Examples: `contract-qa → "Contract QA"`, `nda-review → "NDA Review"`, `msa-review-saas → "MSA Review SaaS"`, `dpa-checklist-review → "DPA Checklist Review"`.
- Edge cases: empty string → `""`; a slug with no hyphens → single title-cased word; already-empty segments collapsed. Pure, no I/O — fully unit-testable. Mirrors the existing `deriveSlug` (the inverse direction) but lives at `src/lib/skills/` because it's consumed by a chat component, not the authoring sub-tree.

## 6. Rendering (`src/lib/components/Message.svelte`)

Inside the existing `{#if message.status === 'done'}` footer block (the `mt-2 text-xs text-mlq-muted` row that holds the Copy button), append — only when `message.applied_skills && message.applied_skills.length > 0`:

- A small inline group: a `ScrollText` lucide icon (size ~11, matching the `ShieldCheck` in the anonymized badge) + the word `Applied:` + the prettified, linked skill names.
- Each name is `<a href="/skills" class="hover:underline">{prettifySkillSlug(slug)}</a>`, comma-separated.
- Uses `text-mlq-muted` to stay quiet; sits beside Copy in the same footer row (e.g. Copy, then a separator/gap, then the Applied group).
- Keyed iteration by slug.

No change to the user-message branch or the streaming/error branches. The line appears only on completed assistant turns that applied skills.

## 7. Upstream request — `docs/upstream-requests/lq-ai-skill-inputs-corpus.md`

Documents the verified problem and proposes the fix so the deferred composer input form becomes worthwhile. Contents:

- **Problem:** `skill_inputs` is accepted, anonymized, and forwarded as `lq_ai_skill_inputs`, but the gateway assembler only interpolates `{{placeholder}}`s and silently drops unreferenced bound inputs; no built-in skill body uses placeholders, so collected inputs never reach the model. Required inputs declared in frontmatter are not enforced for built-ins. (Cite `gateway/app/skills/assembler.py` `interpolate` + `assemble_skill_prompt`; the no-op repro: bind `comms-improver` `text`/`audience` → ignored.)
- **Proposed fix, option (a) — recommended:** after interpolation, append any *bound-but-unreferenced* inputs for each skill to the assembled prompt as a labelled context block (e.g. `### Inputs for {skill}: \n- {name}: {value}`), so any skill — templated or not — benefits from collected inputs. Smallest corpus impact; backward compatible.
- **Proposed fix, option (b):** template the built-in corpus bodies with `{{}}` placeholders matching their declared inputs. Larger; touches every SKILL.md.
- **Exact files / lines**, a minimal failing test sketch (assert bound inputs surface in the assembled prompt for a non-templated skill), and the relay/pin-bump workflow note.

Hand to the user to relay to the lq-ai Claude Code session. **Not a blocker** — this slice's confirmation half ships independently.

## 8. Testing

**Unit (`vitest`)**

- `skillLabel.test.ts`: prettify happy paths, the full acronym set, no-hyphen slug, empty string, multi-acronym slug.
- `chatStream` tests: a `delta` frame with `applied_skills` sets `m.applied_skills`; a `complete` frame with `message.applied_skills` sets/keeps it; `reset()` clears it; history-seeded messages preserve it.
- `Message.svelte` test: renders the footer line (icon + "Applied:" + linked prettified names) when `applied_skills` is non-empty; renders nothing applied-related when empty/undefined; links point at `/skills`.
- `+page.server.ts` history-map test (if an existing server test covers the map, extend it; else assert the mapped message carries `applied_skills`).

**Live e2e (`playwright`, against the running stack)**

- Log in, create a chat, attach a real skill (`comms-improver`) in the in-chat composer, send a message.
- Assert the assistant turn's footer shows `Applied: Comms Improver` and the label links to `/skills`.
- Reload via SPA nav (avoid `page.reload()` per the known SvelteKit-2/Svelte-5 stale-`data` quirk) → confirmation still present from history.
- Self-clean: delete the created chat by captured id in `try/finally`.

**Quality bar:** `npm run check` = 0 errors, 0 warnings (vendor `ERR_MODULE_NOT_FOUND` stderr is harmless); eslint clean on touched files (no `any`). Rebuild `donna-web` (`docker compose up -d --build donna-web`) before the live e2e.

## 9. Components & boundaries

| Unit | Responsibility | Depends on |
|---|---|---|
| `skillLabel.ts` `prettifySkillSlug` | slug → friendly display title | nothing (pure) |
| `chatStream.svelte.ts` | capture/clear `applied_skills` on the message | `sse.ts` frame types |
| `sse.ts` | type `applied_skills` on delta (exists) + complete.message (add) | — |
| `+page.server.ts` history map | seed `applied_skills` from history rows | API row shape |
| `Message.svelte` footer | render the quiet linked confirmation | `prettifySkillSlug` |
| upstream-requests doc | unblock the deferred input form | — (handed to user) |

## 10. Follow-ups after this slice

- When the upstream fix lands: bump the pin, then build the **composer skill-inputs form** (the deferred half) — now with real payoff. Reuse this slice's understanding of the live type taxonomy (`text` is the only practically-fillable type today; `document`/`structured` stay disabled-with-note).
- **Playbooks** (P5-2/P5-3) build on the input-collection machinery.
