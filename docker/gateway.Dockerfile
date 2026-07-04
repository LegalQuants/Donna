# syntax=docker/dockerfile:1
# Donna-published wrapper over the lq-ai `gateway` image. Bakes the default
# gateway.yaml.example into the path the gateway entrypoint seeds its runtime
# /etc/lq-ai/gateway.yaml from on first boot — so no config mount is needed.
# Build context MUST be vendor/lq-ai/ so `gateway.yaml.example` resolves.
# BASE is the lq-ai gateway image (built first; see release.yml).
ARG BASE
FROM ${BASE}
COPY gateway.yaml.example /usr/share/lq-ai/gateway.yaml.example
# Donna packaging: enable the CourtListener case-law tool-provider, gated on
# COURTLISTENER_API_TOKEN. The gateway skips it (with a warning) when the token is
# unset, so research stays OFF until a user brings a key. EDGAR + EUR-Lex are keyless
# (User-Agent only, no API key) and are enabled by default. We never edit the vendored
# submodule — we append our own block to our own wrapper image. This block
# MUST stay in sync with docker/courtlistener.tool_provider.yaml (the test source of truth).
RUN cat >> /usr/share/lq-ai/gateway.yaml.example <<'YAML'

# --- Donna: CourtListener case-law research (active when COURTLISTENER_API_TOKEN is set);
# --- EDGAR + EUR-Lex are keyless and enabled by default ---
tool_providers:
  - name: courtlistener
    type: courtlistener
    base_url: https://www.courtlistener.com/api/rest/v4
    api_key_env: COURTLISTENER_API_TOKEN
    egress_tier: 4
    allowlist:
      hosts: [www.courtlistener.com]
    rate_limit:
      requests_per_minute: 60
    anonymize_outbound: false
  - name: edgar
    type: edgar
    base_url: https://efts.sec.gov
    user_agent: "Donna research (github.com/LegalQuants/Donna)"
    egress_tier: 4
    allowlist:
      hosts: [efts.sec.gov, www.sec.gov]
    rate_limit:
      requests_per_minute: 300
    anonymize_outbound: false
  - name: eurlex
    type: eurlex
    base_url: https://publications.europa.eu
    user_agent: "Donna research (github.com/LegalQuants/Donna)"
    egress_tier: 4
    allowlist:
      hosts: [publications.europa.eu]
    rate_limit:
      requests_per_minute: 60
    anonymize_outbound: false
YAML
