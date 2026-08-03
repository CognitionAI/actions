#!/usr/bin/env bash
# Sync a repo blueprint to Devin and trigger/await a snapshot build via the
# v3beta1 snapshot-setup API.
set -euo pipefail

api() {
  # api <method> <path> [json-body]
  local method="$1" path="$2" body="${3:-}"
  local args=(
    -sS
    --fail-with-body
    -X "$method"
    -H "Authorization: Bearer $DEVIN_API_KEY"
    -H "Content-Type: application/json"
  )
  if [[ -n "$body" ]]; then
    args+=(-d "$body")
  fi
  curl "${args[@]}" "$DEVIN_BASE_URL/v3beta1/organizations/$DEVIN_ORG_ID/snapshot-setup$path"
}

if [[ "$DO_SYNC" == "true" ]]; then
  echo "Syncing blueprint for $DEVIN_REPO ..."
  body=$(jq -cn --arg repo "$DEVIN_REPO" '{repo_name: $repo}')
  resp=$(api POST /sync "$body")
  echo "Synced: $(jq -r '.repo_name' <<<"$resp")"
fi

if [[ "$DO_BUILD" != "true" ]]; then
  echo "build-id=" >>"$GITHUB_OUTPUT"
  echo "build-status=" >>"$GITHUB_OUTPUT"
  exit 0
fi

echo "Triggering snapshot build ..."
resp=$(api POST /builds '{}')
build_id=$(jq -r '.build_id' <<<"$resp")
status=$(jq -r '.status' <<<"$resp")
echo "Build $build_id created (status: $status)"
echo "build-id=$build_id" >>"$GITHUB_OUTPUT"

if [[ "$DO_WAIT" != "true" ]]; then
  echo "build-status=$status" >>"$GITHUB_OUTPUT"
  exit 0
fi

deadline=$((SECONDS + TIMEOUT_MINUTES * 60))
while [[ "$status" == "pending" || "$status" == "running" ]]; do
  if ((SECONDS >= deadline)); then
    echo "build-status=$status" >>"$GITHUB_OUTPUT"
    echo "::error::Timed out after $TIMEOUT_MINUTES minutes waiting for build $build_id (status: $status)"
    exit 1
  fi
  sleep 30
  resp=$(api GET "/builds/$build_id")
  status=$(jq -r '.status' <<<"$resp")
  echo "Build $build_id status: $status"
done

echo "build-status=$status" >>"$GITHUB_OUTPUT"
if [[ "$status" != "succeeded" ]]; then
  echo "::error::Build $build_id finished with status: $status"
  exit 1
fi
echo "Build $build_id succeeded"
