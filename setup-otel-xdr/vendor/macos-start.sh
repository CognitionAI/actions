#!/usr/bin/env bash
set -euo pipefail

root="/Library/Application Support/DevinXdr"
state="$root/state"
logs=/Library/Logs/DevinXdr
install -d -m 0700 "$state"
install -d -m 0755 "$logs"
if [[ ! -s "$state/host.id" ]]; then
  umask 077
  uuidgen > "$state/host.id"
fi
export DEVIN_XDR_HOST_ID
DEVIN_XDR_HOST_ID=$(cat "$state/host.id")
export DEVIN_XDR_BOOT_ID
DEVIN_XDR_BOOT_ID=$(sysctl -n kern.bootsessionuuid)

for _ in $(seq 1 180); do
  [[ -s /Users/devin/.devin/devin_id ]] && break
  sleep 1
done
[[ -s /Users/devin/.devin/devin_id ]] || exit 1
export DEVIN_XDR_SESSION_ID
DEVIN_XDR_SESSION_ID=$(cat /Users/devin/.devin/devin_id)
export DEVIN_XDR_REMOTE_ID="unavailable"
if [[ -s /Users/devin/.devin/remote_id ]]; then
  DEVIN_XDR_REMOTE_ID=$(cat /Users/devin/.devin/remote_id)
fi

if [[ -s "$root/oidc-audience" ]]; then
  audience=$(cat "$root/oidc-audience")
  subject_keys=$(cat "$root/oidc-subject-keys")
  refresh_token() {
    local tmp_file
    tmp_file=$(mktemp "$state/oidc-token.XXXXXX")
    if DEVIN_OIDC_TOKEN_FILE=/Users/devin/.devin/oidc_token \
      /usr/local/bin/devin-oidc token --audience "$audience" --subject-keys "$subject_keys" > "$tmp_file"; then
      chmod 0600 "$tmp_file"
      mv "$tmp_file" "$state/oidc-token"
    else
      rm -f "$tmp_file"
    fi
  }
  until refresh_token; do sleep 2; done
  while true; do
    sleep 30
    refresh_token || true
  done &
fi

while true; do
  : > "$logs/unified.ndjson"
  /usr/bin/log stream --style ndjson --level info --predicate 'process != "otelcol-contrib"' |
    head -c 67108864 >> "$logs/unified.ndjson" || true
  sleep 1
done &
log_pid=$!
trap 'kill "$log_pid" 2>/dev/null || true' EXIT
"$root/otelcol-contrib" --config="$root/config.json"
