#!/bin/bash
# =============================================================================
# DRS Action Runner Simulator
# =============================================================================
# Faithfully replicates the execution path of action_runner.py's
# _run_node_script() and _apply_side_effects() methods.
#
# This is how DRS actually runs Node.js actions:
# 1. Creates GITHUB_ENV, GITHUB_PATH, ENVRC temp files
# 2. Sources secrets + envrc
# 3. Sets ENVRC env var pointing to envrc file
# 4. Sets INPUT_* env vars (uppercase, preserves hyphens)
# 5. Sets GITHUB_* stub env vars
# 6. Runs: nvm use <version> && node <script>
# 7. Parses GITHUB_ENV and GITHUB_PATH files
# 8. Propagates side effects back to ENVRC
#
# Usage:
#   ./scripts/drs-simulate.sh <action-dir> [input-name=value ...]
#
# Example:
#   ./scripts/drs-simulate.sh setup-python-uv
#   ./scripts/drs-simulate.sh setup-go go-version=1.22.0
#   ./scripts/drs-simulate.sh configure-pip-registry index-url=https://pypi.org/simple
# =============================================================================

set -euo pipefail

ACTION_DIR="$1"
shift

if [ ! -f "$ACTION_DIR/dist/index.js" ]; then
  echo "ERROR: $ACTION_DIR/dist/index.js not found. Run 'npm run build' first."
  exit 1
fi

SCRIPT_PATH="$(pwd)/$ACTION_DIR/dist/index.js"
ACTION_ROOT="$(pwd)/$ACTION_DIR"

# ---- Step 1: Create per-step file-command files (matches action_runner.py L545-554) ----
RUNNER_TEMP=$(mktemp -d /tmp/runner_temp_XXXXXX)
STEP_ID=$(head -c6 /dev/urandom | xxd -p)
ENV_FILE="$RUNNER_TEMP/env_${STEP_ID}"
PATH_FILE="$RUNNER_TEMP/path_${STEP_ID}"
OUTPUT_FILE="$RUNNER_TEMP/output_${STEP_ID}"
STATE_FILE="$RUNNER_TEMP/state_${STEP_ID}"
SUMMARY_FILE="$RUNNER_TEMP/summary_${STEP_ID}"
ENVRC_FILE="$RUNNER_TEMP/envrc"
SECRETS_FILE="$RUNNER_TEMP/secrets"

touch "$ENV_FILE" "$PATH_FILE" "$OUTPUT_FILE" "$STATE_FILE" "$SUMMARY_FILE" "$ENVRC_FILE" "$SECRETS_FILE"

# ---- Step 2: Build GITHUB_* stub env vars (matches _GITHUB_STUB_ENV, L63-87) ----
# These are the exact vars the action runner sets
GITHUB_STUB_VARS=(
  "CI=true"
  "GITHUB_ACTIONS=true"
  "GITHUB_SERVER_URL=https://github.com"
  "GITHUB_API_URL=https://api.github.com"
  "GITHUB_GRAPHQL_URL=https://api.github.com/graphql"
  "GITHUB_REPOSITORY=usacognition/drs-actions-library"
  "GITHUB_REPOSITORY_OWNER=usacognition"
  "GITHUB_REPOSITORY_ID=0"
  "GITHUB_REPOSITORY_OWNER_ID=0"
  "GITHUB_SHA=0000000000000000000000000000000000000000"
  "GITHUB_REF=refs/heads/main"
  "GITHUB_REF_NAME=main"
  "GITHUB_REF_TYPE=branch"
  "GITHUB_RUN_ID=0"
  "GITHUB_RUN_NUMBER=1"
  "GITHUB_RUN_ATTEMPT=1"
  "GITHUB_RETENTION_DAYS=90"
  "GITHUB_EVENT_NAME=push"
  "RUNNER_OS=Linux"
  "RUNNER_ARCH=X64"
  "RUNNER_DEBUG=0"
  "RUNNER_TEMP=$RUNNER_TEMP"
  "RUNNER_TOOL_CACHE=/opt/hostedtoolcache"
  "GITHUB_ACTION=usacognition-drs-actions-library"
  "GITHUB_ACTION_PATH=$ACTION_ROOT"
  "GITHUB_ACTION_REPOSITORY=usacognition/drs-actions-library"
  "GITHUB_WORKSPACE=$(pwd)"
  "GITHUB_ENV=$ENV_FILE"
  "GITHUB_PATH=$PATH_FILE"
  "GITHUB_OUTPUT=$OUTPUT_FILE"
  "GITHUB_STATE=$STATE_FILE"
  "GITHUB_STEP_SUMMARY=$SUMMARY_FILE"
)

# ---- Step 3: Build INPUT_* env vars (matches _build_input_env, L813-848) ----
# GitHub uppercases and preserves hyphens (NOT replaced with underscores)
INPUT_VARS=()
for arg in "$@"; do
  key="${arg%%=*}"
  value="${arg#*=}"
  upper_key=$(echo "$key" | tr '[:lower:]' '[:upper:]' | tr ' ' '_')
  INPUT_VARS+=("INPUT_${upper_key}=${value}")
done

# ---- Step 4: Build the execution command (matches _run_node_script, L892-903) ----
# Separate vars into safe (bash export) and unsafe (env command prefix)
SAFE_EXPORTS=""
ENV_CMD_VARS=""
ALL_VARS=("${GITHUB_STUB_VARS[@]}" "${INPUT_VARS[@]}" "ENVRC=$ENVRC_FILE")

for var in "${ALL_VARS[@]}"; do
  key="${var%%=*}"
  value="${var#*=}"
  if [[ "$key" =~ ^[A-Za-z_][A-Za-z0-9_]*$ ]]; then
    SAFE_EXPORTS+="export ${key}='${value}'"$'\n'
  else
    # Hyphenated vars must use env command (matches action_runner.py L889)
    ENV_CMD_VARS+="${key}='${value}' "
  fi
done

echo "================================================================"
echo "DRS Action Runner Simulation"
echo "================================================================"
echo "Action:    $ACTION_DIR"
echo "Script:    $SCRIPT_PATH"
echo "ENVRC:     $ENVRC_FILE"
echo "ENV file:  $ENV_FILE"
echo "PATH file: $PATH_FILE"
echo ""
echo "INPUT_* vars:"
for iv in "${INPUT_VARS[@]:-}"; do
  [ -n "$iv" ] && echo "  $iv"
done
echo ""
echo "================================================================"
echo "Running action..."
echo "================================================================"
echo ""

# ---- Step 5: Execute exactly as action_runner.py does (L892-903) ----
# Source secrets, source envrc, set exports, nvm use, node script
NODE_VERSION="20"

# Build env prefix for hyphenated vars (matches action_runner.py L889)
ENV_PREFIX=""
if [ -n "$ENV_CMD_VARS" ]; then
  ENV_PREFIX="env ${ENV_CMD_VARS}"
fi

# Build the command exactly like action_runner.py
COMMAND="set -e
. '${SECRETS_FILE}' 2>/dev/null || true
export ENVRC='${ENVRC_FILE}'
set -a; . '${ENVRC_FILE}' || true; set +a
${SAFE_EXPORTS}
export NVM_DIR=\"\$HOME/.nvm\"
[ -s \"\$NVM_DIR/nvm.sh\" ] && . \"\$NVM_DIR/nvm.sh\"
nvm install ${NODE_VERSION} > /dev/null 2>&1 || true
nvm use ${NODE_VERSION}
${ENV_PREFIX}node '${SCRIPT_PATH}'"

# Execute
bash -c "$COMMAND"
EXIT_CODE=$?

echo ""
echo "================================================================"
echo "Post-execution: Applying side effects (like _apply_side_effects)"
echo "================================================================"
echo ""
echo "Exit code: $EXIT_CODE"
echo ""

# ---- Step 6: Parse GITHUB_PATH side effects (matches L1977-1991) ----
if [ -s "$PATH_FILE" ]; then
  echo "--- GITHUB_PATH entries (will be added to ENVRC) ---"
  while IFS= read -r entry; do
    [ -z "$entry" ] && continue
    echo "  PATH+=  $entry"
    echo "export PATH='${entry}':\$PATH" >> "$ENVRC_FILE"
  done < "$PATH_FILE"
  echo ""
fi

# ---- Step 7: Parse GITHUB_ENV side effects (matches L1993-2014) ----
if [ -s "$ENV_FILE" ]; then
  echo "--- GITHUB_ENV entries (will be added to ENVRC) ---"
  # Simple single-line parser; the full runner handles heredoc-style too
  while IFS= read -r line; do
    [ -z "$line" ] && continue
    if [[ "$line" == *"<<"* ]]; then
      # Heredoc-style: KEY<<DELIMITER ... DELIMITER
      key="${line%%<<*}"
      delimiter="${line#*<<}"
      value=""
      while IFS= read -r hline; do
        [ "$hline" = "$delimiter" ] && break
        [ -n "$value" ] && value+=$'\n'
        value+="$hline"
      done
      echo "  export ${key}=(heredoc value, ${#value} chars)"
      echo "export ${key}='${value}'" >> "$ENVRC_FILE"
    elif [[ "$line" == *"="* ]]; then
      key="${line%%=*}"
      value="${line#*=}"
      echo "  export ${key}=${value}"
      echo "export ${key}='${value}'" >> "$ENVRC_FILE"
    fi
  done < "$ENV_FILE"
  echo ""
fi

# ---- Step 8: Show final ENVRC state ----
echo "--- Final ENVRC contents (what Devin session inherits) ---"
cat "$ENVRC_FILE"
echo ""

# ---- Step 9: Verify results ----
echo "================================================================"
echo "Verification"
echo "================================================================"

# Source the ENVRC and verify the tool/config is available
if [ "$EXIT_CODE" -eq 0 ]; then
  echo "Action completed successfully."

  # Source ENVRC to get the exported vars
  set -a; source "$ENVRC_FILE" 2>/dev/null || true; set +a

  # Attempt to verify based on action type
  case "$ACTION_DIR" in
    setup-python-uv)
      echo "Checking uv availability..."
      which uv 2>/dev/null && uv --version || echo "WARN: uv not found on PATH after ENVRC sourcing"
      ;;
    setup-python-pip)
      echo "Checking venv python..."
      which python 2>/dev/null && python --version || echo "WARN: python not found"
      ;;
    setup-go)
      echo "Checking go availability..."
      which go 2>/dev/null && go version || echo "WARN: go not found"
      ;;
    setup-rust)
      echo "Checking rustc..."
      which rustc 2>/dev/null && rustc --version || echo "WARN: rustc not found"
      ;;
    configure-pip-registry)
      echo "Checking pip.conf..."
      cat ~/.config/pip/pip.conf 2>/dev/null || echo "WARN: pip.conf not found"
      ;;
    configure-npm-scoped-registry|configure-npm-mirror)
      echo "Checking .npmrc..."
      cat ~/.npmrc 2>/dev/null || echo "WARN: .npmrc not found"
      ;;
    set-env-vars)
      echo "Checking /etc/profile.d/drs-env.sh..."
      cat /etc/profile.d/drs-env.sh 2>/dev/null || echo "WARN: profile script not found"
      ;;
    install-system-packages)
      echo "Packages installed successfully."
      ;;
    *)
      echo "(No specific verification for this action type)"
      ;;
  esac
else
  echo "ACTION FAILED with exit code $EXIT_CODE"
fi

echo ""
echo "================================================================"
echo "Simulation complete."
echo "================================================================"

# Cleanup
rm -rf "$RUNNER_TEMP"
exit $EXIT_CODE
