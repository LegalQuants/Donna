#!/usr/bin/env bash
# Verifies the vendored gateway example + Donna's appended CourtListener snippet is valid
# YAML with an active `tool_providers: courtlistener` (api_key_env COURTLISTENER_API_TOKEN).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SNIP="$ROOT/docker/courtlistener.tool_provider.yaml"
EX="$ROOT/vendor/lq-ai/gateway.yaml.example"
python3 - "$EX" "$SNIP" <<'PY'
import sys, yaml
ex, snip = open(sys.argv[1]).read(), open(sys.argv[2]).read()
cfg = yaml.safe_load(ex + "\n" + snip)
tps = cfg.get("tool_providers") or []
assert any(p.get("name") == "courtlistener" and p.get("api_key_env") == "COURTLISTENER_API_TOKEN"
           and p.get("anonymize_outbound") is False for p in tps), f"bad tool_providers: {tps}"
print("OK: courtlistener tool_provider present and valid")
PY
