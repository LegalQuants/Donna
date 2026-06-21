# Decision: release-side CourtListener wiring

The `donna-gateway` wrapper image (`docker/gateway.Dockerfile`) appends a Donna-owned
`tool_providers: courtlistener` block (mirror of `docker/courtlistener.tool_provider.yaml`) onto the
baked `gateway.yaml.example`, gated on `COURTLISTENER_API_TOKEN`. The gateway skips an un-keyed
provider at startup (with a warning) and still serves, so a user enables case-law research by setting
the token alone — no `gateway.yaml` edit. `anonymize_outbound: false`: CourtListener queries are
public case-law lookups (case names / legal terms); anonymizing them would rewrite entities and wreck
search results.

**Drift caveat:** the snippet must stay valid against upstream's `vendor/lq-ai/gateway.yaml.example`
on every pin bump; `docker/gateway-config.test.sh` verifies the concatenation parses with an active
`courtlistener` provider. MCP stays operator opt-in (env vars plumbed, no default servers). Dev still
seeds the commented-out vendored example — a developer appends the block once (handoff recipe) or sets
the token after enabling it; turnkey behavior is verified on the release-image path.
