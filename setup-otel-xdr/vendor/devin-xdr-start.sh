#!/usr/bin/env bash
set -euo pipefail

state_dir=/var/lib/devin-xdr
install -d -m 0700 "$state_dir"
runtime_dir=/run/devin-xdr
install -d -m 0700 "$runtime_dir"
identity_file="$state_dir/host.id"
if [[ ! -s "$identity_file" ]]; then
  umask 077
  cat /proc/sys/kernel/random/uuid > "$identity_file"
fi
export DEVIN_XDR_HOST_ID
DEVIN_XDR_HOST_ID=$(cat "$identity_file")
export DEVIN_XDR_BOOT_ID
DEVIN_XDR_BOOT_ID=$(cat /proc/sys/kernel/random/boot_id)

session_id_file=/opt/.devin/devin_id
for _ in $(seq 1 120); do
  [[ -s "$session_id_file" ]] && break
  sleep 1
done
[[ -s "$session_id_file" ]] || {
  echo "devin-xdr: no session identity at $session_id_file" >&2
  exit 1
}
export DEVIN_XDR_SESSION_ID
DEVIN_XDR_SESSION_ID=$(cat "$session_id_file")
export DEVIN_XDR_REMOTE_ID="unavailable"
if [[ -s /opt/.devin/remote_id ]]; then
  DEVIN_XDR_REMOTE_ID=$(cat /opt/.devin/remote_id)
fi

if [[ -s /etc/devin-xdr/oidc-audience ]]; then
  audience=$(cat /etc/devin-xdr/oidc-audience)
  subject_keys=$(cat /etc/devin-xdr/oidc-subject-keys)
  token_file="$runtime_dir/oidc-token"
  refresh_token() {
    local tmp_file
    tmp_file=$(mktemp "$runtime_dir/oidc-token.XXXXXX")
    if DEVIN_OIDC_TOKEN_FILE=/opt/.devin/oidc_token \
      /usr/local/bin/devin-oidc token --audience "$audience" --subject-keys "$subject_keys" > "$tmp_file"; then
      chmod 0600 "$tmp_file"
      mv "$tmp_file" "$token_file"
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

/usr/local/bin/otelcol-contrib --config=/etc/devin-xdr/config.json
