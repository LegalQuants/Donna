# syntax=docker/dockerfile:1
# Donna-published wrapper over the lq-ai `gateway` image. Bakes the default
# gateway.yaml.example into the path the gateway entrypoint seeds its runtime
# /etc/lq-ai/gateway.yaml from on first boot — so no config mount is needed.
# Build context MUST be vendor/lq-ai/ so `gateway.yaml.example` resolves.
# BASE is the lq-ai gateway image (built first; see release.yml).
ARG BASE
FROM ${BASE}
COPY gateway.yaml.example /usr/share/lq-ai/gateway.yaml.example
