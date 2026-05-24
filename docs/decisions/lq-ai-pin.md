# Decision: lq-ai backend pin

Donna vendors `LegalQuants/lq-ai` at `vendor/lq-ai` as a git submodule.

- Pinned SHA: `8b8e5496e7464d3e15fb8890ad9ebdde4257e724`
- Captured: 2026-05-24
- Why: the UX/behavior reference docs and the build target must track the same
  backend version. Bump deliberately (one PR per bump), regenerating API types.
