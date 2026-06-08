# Contributing to Donna

Thanks for your interest in Donna. This is a short guide; the full engineering picture —
architecture, conventions, gotchas, and how to pick up a roadmap item — is in
**[CLAUDE.md](CLAUDE.md)**. Read that first.

## Getting set up

Follow the [README](README.md): clone **with submodules** (`--recurse-submodules` — the skills
corpus is nested), `npm install`, `npm run gen:api`, copy `.env.example` → `.env`, then bring up the
stack. Prereqs: Docker + Compose v2, Node 22+.

## The workflow

Donna is built with a disciplined loop (see [CLAUDE.md §6](CLAUDE.md)):
**brainstorm → spec → plan → test-driven implementation → review → PR.** Designs land in
`docs/superpowers/specs/`, plans in `docs/superpowers/plans/`. Scale the ceremony to the change, but
anything that adds a surface or touches the API contract gets a spec.

## The bar (must be green before a PR)

```bash
npm run check        # svelte-check — 0 errors / 0 warnings
npm run lint         # prettier + eslint — fully green
npx vitest run       # unit/component tests pass
npx playwright test  # live e2e (stack up + admin fixture) for feature work
```

- Write tests first (TDD). Live e2e are real runs against the stack and must self-clean.
- Match existing patterns: Svelte 5 runes, tabs, defensive parsers, honest degradation. See
  [CLAUDE.md §7](CLAUDE.md).

## Two rules that protect the project

1. **Never edit `vendor/lq-ai`** — it's a pinned submodule. Backend gaps become an upstream request
   (`docs/upstream-requests/`), not a local patch. See [CLAUDE.md §8](CLAUDE.md).
2. **Merge with a merge commit**, never a squash — a squash orphans the format SHAs in
   `.git-blame-ignore-revs`.

## Commits & PRs

- Conventional-style messages (`feat(automations): …`, `fix(docpanel): …`, `docs: …`).
- Commit + push per task; open a PR against `main` with a clear description of what changed and how
  it was verified.

By contributing you agree your contributions are licensed under the project's
[Apache-2.0 license](LICENSE).
