# Donna — `docs/` index

Where the project's written knowledge lives. Start with the two top-level guides, then dive into the
subdirectories as needed.

## Start here

- **[GUIDE.md](GUIDE.md)** — the friendly, non-technical guide: what Donna is, what you can do with
  it today, how it works in plain terms, and what else you could build on LQ-AI. Start here if you're
  new to the project.
- **[../README.md](../README.md)** — run it: prerequisites, setup, compose bring-up, verify.
- **[PRODUCT.md](PRODUCT.md)** — what Donna is, who it's for, capabilities, principles, non-goals.
- **[../CLAUDE.md](../CLAUDE.md)** — engineering guide: architecture, the build workflow,
  conventions, gotchas, and how to pick up a roadmap item. (Read this before contributing.)
- **[../CHANGELOG.md](../CHANGELOG.md)** — release history.

## Subdirectories

- **`roadmap/`** — forward-looking plans.
  - `donna-future-roadmap.md` — what's deferred or upstream-blocked, with pickup context.
  - `autonomous-workflows-scope.md` — the original Automations scoping (historical; the segment has
    since shipped).
- **`decisions/`** — architectural decisions.
  - `lq-ai-pin.md` — the running log of every `vendor/lq-ai` submodule pin bump and what it
    unblocked. Read the top entry to know which backend you're on.
- **`upstream-requests/`** — feature/contract asks filed to the lq-ai backend (some resolved, some
  open). The workflow is described in [../CLAUDE.md](../CLAUDE.md) §8.
- **`superpowers/`** — the design + execution archive. `specs/` holds the design doc for every
  shipped phase; `plans/` holds its task-by-task implementation plan; `HANDOFF-*.md` are
  point-in-time session handoffs. Read the closest analog before building something new.
- **`research/`** — design research (the MikeOSS frontend scope + UX breakdown that informed the
  reading-first interface).
- **`images/`** — screenshots and visual assets referenced by the README.

## The most current docs are in the app

Signed in, open **/about** — a full in-app guide to every feature plus interactive playgrounds
explaining how the LQ-AI engine works. It is fact-checked against the live code and is the richest,
most up-to-date documentation Donna has.
