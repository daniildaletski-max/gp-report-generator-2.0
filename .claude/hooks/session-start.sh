#!/bin/bash
set -euo pipefail

# SessionStart hook — Claude Code on the web only. Installs the JS deps so
# `pnpm run check` (tsc) and `pnpm test` (vitest) work from the first turn.
# Local environments manage their own deps and skip this entirely.
if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

cd "$CLAUDE_PROJECT_DIR"

# The repo pins pnpm via package.json#packageManager (pnpm@10.x).
# Prefer a pnpm already on PATH; otherwise activate it through corepack,
# and as a last resort install it globally via npm.
if ! command -v pnpm >/dev/null 2>&1; then
  corepack enable >/dev/null 2>&1 || true
fi
if ! command -v pnpm >/dev/null 2>&1; then
  npm install -g pnpm@10
fi

# Incremental install (NOT a clean `--frozen-lockfile` wipe) so the cached
# container's node_modules and pnpm store are reused — subsequent sessions
# only download deltas. Idempotent: re-running is a no-op when up to date.
pnpm install --prefer-offline

echo "SessionStart hook: dependencies ready (node $(node --version), pnpm $(pnpm --version))"
