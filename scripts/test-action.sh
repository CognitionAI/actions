#!/bin/bash
# Simulates how the DRS action runner executes a Node.js action.
# Usage: ./scripts/test-action.sh <action-dir> [NAME=value ...]
#
# Example: ./scripts/test-action.sh setup-python-uv
# Example: ./scripts/test-action.sh configure-pip-registry INDEX-URL=https://pypi.org/simple

set -euo pipefail

ACTION_DIR="$1"
shift

if [ ! -f "$ACTION_DIR/dist/index.js" ]; then
  echo "ERROR: $ACTION_DIR/dist/index.js not found"
  exit 1
fi

# Create temp files for GITHUB_ENV, GITHUB_PATH, GITHUB_OUTPUT, ENVRC
RUNNER_TEMP=$(mktemp -d)
export RUNNER_TEMP
export GITHUB_ENV="$RUNNER_TEMP/env"
export GITHUB_PATH="$RUNNER_TEMP/path"
export GITHUB_OUTPUT="$RUNNER_TEMP/output"
export GITHUB_STATE="$RUNNER_TEMP/state"
export GITHUB_STEP_SUMMARY="$RUNNER_TEMP/summary"
export GITHUB_WORKSPACE="$(pwd)"
export ENVRC="$RUNNER_TEMP/envrc"

touch "$GITHUB_ENV" "$GITHUB_PATH" "$GITHUB_OUTPUT" "$GITHUB_STATE" "$GITHUB_STEP_SUMMARY" "$ENVRC"

# Build env command prefix for INPUT_* vars (handles hyphens which bash can't export)
ENV_ARGS=()
for arg in "$@"; do
  key="${arg%%=*}"
  value="${arg#*=}"
  # @actions/core getInput uppercases the name and looks for INPUT_<NAME>
  upper_key=$(echo "$key" | tr '[:lower:]' '[:upper:]')
  ENV_ARGS+=("INPUT_${upper_key}=${value}")
done

echo "=== Testing action: $ACTION_DIR ==="
echo ""

# Run the action with env prefix for INPUT_* vars
if [ ${#ENV_ARGS[@]} -gt 0 ]; then
  env "${ENV_ARGS[@]}" node "$ACTION_DIR/dist/index.js"
else
  node "$ACTION_DIR/dist/index.js"
fi
EXIT_CODE=$?

echo ""
echo "=== Results ==="
echo "Exit code: $EXIT_CODE"

if [ -s "$GITHUB_ENV" ]; then
  echo "--- GITHUB_ENV ---"
  cat "$GITHUB_ENV"
fi

if [ -s "$GITHUB_PATH" ]; then
  echo "--- GITHUB_PATH ---"
  cat "$GITHUB_PATH"
fi

if [ -s "$ENVRC" ]; then
  echo "--- ENVRC ---"
  cat "$ENVRC"
fi

# Cleanup
rm -rf "$RUNNER_TEMP"
exit $EXIT_CODE
