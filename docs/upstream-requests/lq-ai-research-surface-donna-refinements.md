# LQ-AI ask — three refinements to the `/api/v1/research` surface for Donna

**Filed:** 2026-06-17 · **From:** Donna (consumer) · **For:** Donna Slice A — the case-law research
workspace (frontend for the legal-research milestone). · **Timing:** ideally folded into **PR3b**
(branch `feat/research-api`, where the surface is being built) *before* it merges, so Donna builds
against the final shape; otherwise a small fast-follow. None of these block the merge.

The LQ-AI session works in `/Users/kevinkeller/Code/lq-ai` (absolute paths below; it can't see Donna
branches). All three are grounded in the current `feat/research-api` source.

## Context

Donna is building a reading-first **Research workspace** over `/api/v1/research/*`: search → read an
opinion in the doc panel → find-in-case → verify citations. The contract as drafted
(`/Users/kevinkeller/Code/lq-ai/api/app/api/research.py`,
`/Users/kevinkeller/Code/lq-ai/api/app/schemas/research.py`) is a clean fit. These three refinements
remove a heuristic and two guesses on the Donna side — they make the UI honest and let Donna drop a
hand-parser. Listed in priority order.

---

## Ask 1 (most valuable) — an explicit "is research enabled?" signal

**The gap.** CourtListener is feature-flagged off until the operator declares a `courtlistener`
tool-provider (with `COURTLISTENER_API_TOKEN`) in `gateway.yaml`. When it's *not* configured, a Donna
user hitting `/research` should see a calm "Case-law research isn't enabled on this server" gate — not
an error. But today Donna can only **infer** that from a failed/empty response, which is
indistinguishable from a transient gateway/network failure. There is no capabilities or health
endpoint that reports it (`grep` for `capabilities`/`/health` in
`/Users/kevinkeller/Code/lq-ai/api/app/api/` finds only MFA-related `*_enabled` fields).

**The ask.** A deterministic signal Donna can read at page load. Any of these works; (a) is cleanest:

- **(a)** `GET /api/v1/research/capabilities` → `{ enabled: bool, providers: [{ name, type }] }` (or a
  minimal `{ research_enabled: bool }`). Active-user auth, no secrets — just whether a `courtlistener`
  tool-provider is wired.
- **(b)** Fold a `research` flag into an existing capabilities/feature-flags endpoint if one is
  planned.
- **(c)** At minimum, a **distinct, documented error code** when the provider is unconfigured (e.g.
  `503 research_not_configured` / a typed `code`), so Donna distinguishes "off" from "broke." This is
  the cheapest option but leaves Donna gating on an error path rather than a positive signal.

**Why it matters.** Without this, Donna's not-enabled gate is heuristic and could mis-render a real
outage as "not enabled" (or vice-versa). A positive capability signal makes the gate correct.

## Ask 2 (easy win) — type the `verify-citations` response

**The gap.** `VerifyCitationsResponse.citations` is `list[dict[str, Any]]`
(`/Users/kevinkeller/Code/lq-ai/api/app/schemas/research.py`), so it lands in OpenAPI — and Donna's
`gen:api` — as an untyped blob. Donna must hand-write a defensive parser for it.

**But the shape is already deterministic.** The gateway adapter builds each item explicitly
(`/Users/kevinkeller/Code/lq-ai/gateway/app/providers/tool/courtlistener.py:206-222`):

```jsonc
{
  "citation": "576 U.S. 644",
  "normalized_citations": ["576 U.S. 644"],
  "status": 200,                       // CourtListener citation-lookup status (200 found, 404 not, …)
  "error_message": null,
  "clusters": [{ "id": 123, "case_name": "Obergefell v. Hodges", "absolute_url": "/opinion/…/" }]
}
```

**The ask.** Promote that to a typed Pydantic model — e.g. `VerifiedCitation { citation: str|None,
normalized_citations: list[str], status: int|None, error_message: str|None, clusters:
list[CitationCluster] }` with `CitationCluster { id: int, case_name: str|None, absolute_url:
str|None }` — and set `VerifyCitationsResponse.citations: list[VerifiedCitation]`. The adapter already
emits exactly this; it's a schema-layer change. Donna then derives the type from `gen:api` and drops
the hand-parser (matches the project preference: typed contract over hand-fork).

If the upstream CourtListener payload is considered too unstable to pin, a documented note to that
effect is enough — Donna keeps the parser but at least knows it's deliberate.

## Ask 3 (small) — document the `text_field_used` value set

**The gap.** Opinions/clusters carry `text_field_used: str | None`
(`schemas/research.py`; set from the adapter). Donna wants to label the reader honestly — e.g.
"plain text" vs "HTML-derived" — but the set of possible values isn't documented in the contract.

**It's already a closed set** in the adapter's preference order
(`/Users/kevinkeller/Code/lq-ai/gateway/app/providers/tool/courtlistener.py:35-41`):
`html_with_citations`, `html_columbia`, `html_lawbox`, `html_anon_2020`, `html`, `plain_text`.

**The ask.** Either type it as a `Literal[...]`/enum in the schema, or document the value set in the
OpenAPI field description. Either lets Donna map values to honest, friendly source labels (and treat
the `html_*` family as "HTML-derived, formatting normalized") rather than displaying a raw token.

---

## Follow-up (2026-06-17) — asks shipped in #163 (`38dbbb0`), but the OpenAPI spec drifted

LQ-AI delivered all three asks in **#163 (`38dbbb0`)** as typed Pydantic models — thank you. One
catch found when verifying for the pin bump: `docs/api/backend-openapi.yaml` is **hand-maintained and
lags the typed models**, and Donna's `gen:api` reads *that yaml*, not the live FastAPI app. So two of
the three asks don't reach Donna's generated types yet:

| Ask | Pydantic model (✅ in code) | `docs/api/backend-openapi.yaml` (what Donna consumes) |
|---|---|---|
| 1 — capabilities | `ResearchCapabilities` | ✅ correct (`{enabled, providers:[{name,type}]}`) |
| 2 — verify-citations | `VerifiedCitation` | ❌ still `citations: items: {type: object, additionalProperties: true}` |
| 3 — `text_field_used` | `OpinionTextField` Literal | ❌ still `{type: string, nullable: true}` (no enum) |

**Ask (small, schema-doc only):** update `backend-openapi.yaml` so the consumable contract matches the
code —
1. the `/research/verify-citations` 200 `citations[]` items reference the `VerifiedCitation` shape
   (`{citation, normalized_citations[], status, error_message, clusters:[{id, case_name,
   absolute_url}]}`);
2. `text_field_used` (on the `/research/clusters/{id}` opinions list **and** `/research/opinions/{id}`)
   becomes an `enum` of the 7 `OpinionTextField` values (`html_with_citations`, `html_columbia`,
   `html_lawbox`, `xml_harvard`, `html_anon_2020`, `html`, `plain_text`).

Ideally the spec is generated from the FastAPI app (`app.openapi()`) so it can't drift again — but if
it stays hand-maintained, the two edits below are enough. Donna will pin + `gen:api` once the yaml
carries the typed shapes, and gets the full refined contract in one clean bump.

### Precise fix (against `docs/api/backend-openapi.yaml` @ `38dbbb0`)

The research paths use inline schemas (no `#/components/schemas/*`), so these stay inline to match.

**Edit 1 — `/api/v1/research/verify-citations`, the `200` response.** Replace the loose `items`
(lines **4821–4823**):

```yaml
                  citations:
                    type: array
                    items:                       # <-- was: {type: object, additionalProperties: true}
                      type: object
                      properties:
                        citation: {type: string, nullable: true}
                        normalized_citations:
                          type: array
                          items: {type: string}
                        status: {type: integer, nullable: true}
                        error_message: {type: string, nullable: true}
                        clusters:
                          type: array
                          items:
                            type: object
                            properties:
                              id: {type: integer, nullable: true}
                              case_name: {type: string, nullable: true}
                              absolute_url: {type: string, nullable: true}
```

**Edit 2 — `text_field_used` enum, BOTH occurrences** (line **4926**, the `/clusters/{id}` opinions
list, at its 24-space indent; and line **4963**, `/opinions/{id}`, at its 18-space indent). Replace
`text_field_used: {type: string, nullable: true}` with (re-indent per location):

```yaml
                        text_field_used:
                          type: string
                          nullable: true
                          enum: [html_with_citations, html_columbia, html_lawbox, xml_harvard, html_anon_2020, html, plain_text]
```

That's it — three spots, no structural change. `openapi-typescript` then emits a structured
`VerifiedCitation`-shaped type and a 7-member string union for `text_field_used`, so both asks reach
Donna's `backend.d.ts`. (If you'd rather kill the drift permanently: dump `app.openapi()` to this file
in CI/a make target instead of hand-editing — the `EXPECTED_PATHS`/`test_openapi.py` machinery is
already the natural home for that check.)

## Conventions Donna will follow regardless

- Donna consumes only the published API (re-runs `gen:api` after the pin bump; the merged shape wins
  over this ask). Where a field stays loose, Donna keeps a defensive parser and says so in a comment.
- No behavior change requested to the read/search/find endpoints themselves — they're a good fit as
  drafted.
