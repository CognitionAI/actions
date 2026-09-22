#!/usr/bin/env bash
set -euo pipefail

tmp_dir=$(mktemp -d)
trap 'rm -rf "$tmp_dir"' EXIT
url="https://github.com/open-telemetry/opentelemetry-collector-releases/releases/download/v${DEVIN_XDR_COLLECTOR_VERSION}/otelcol-contrib_${DEVIN_XDR_COLLECTOR_VERSION}_linux_${DEVIN_XDR_ARCH}.tar.gz"

curl -fsSL --retry 3 "$url" -o "$tmp_dir/collector.tar.gz"
curl -fsSL --retry 3 "$url.sha256" -o "$tmp_dir/collector.tar.gz.sha256"
test "$(sha256sum "$tmp_dir/collector.tar.gz" | cut -d ' ' -f 1)" = "$(cut -d ' ' -f 1 "$tmp_dir/collector.tar.gz.sha256")"
tar -xzf "$tmp_dir/collector.tar.gz" -C "$tmp_dir"
test -x "$tmp_dir/otelcol-contrib"

sudo systemctl stop devin-xdr.service 2>/dev/null || true
sudo install -D -m 0755 "$tmp_dir/otelcol-contrib" /usr/local/bin/otelcol-contrib
sudo install -d -m 0755 "$DEVIN_XDR_CONFIG_DIR" /var/log/devin-xdr
sudo install -m 0600 "$DEVIN_XDR_TEMP_CONFIG" "$DEVIN_XDR_CONFIG_PATH"

action_root=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
sudo install -D -m 0755 "$action_root/vendor/devin-xdr-start.sh" /usr/local/libexec/devin-xdr-start
sudo install -m 0644 "$action_root/vendor/devin-xdr.service" /etc/systemd/system/devin-xdr.service
sudo rm -f "$DEVIN_XDR_CONFIG_DIR/oidc-audience" "$DEVIN_XDR_CONFIG_DIR/oidc-subject-keys"
if [[ -n "$DEVIN_XDR_TEMP_OIDC_AUDIENCE" ]]; then
  sudo install -m 0600 "$DEVIN_XDR_TEMP_OIDC_AUDIENCE" "$DEVIN_XDR_CONFIG_DIR/oidc-audience"
  sudo install -m 0600 "$DEVIN_XDR_TEMP_OIDC_SUBJECT_KEYS" "$DEVIN_XDR_CONFIG_DIR/oidc-subject-keys"
fi

if [[ "$DEVIN_XDR_COLLECT_NATIVE_AUDIT" == "true" ]]; then
  export DEBIAN_FRONTEND=noninteractive
  sudo apt-get update -qq
  sudo apt-get install -y -qq auditd
  sudo install -m 0640 "$action_root/vendor/devin-xdr.rules" /etc/audit/rules.d/devin-xdr.rules
  sudo augenrules --load
  sudo systemctl enable auditd.service
else
  sudo rm -f /etc/audit/rules.d/devin-xdr.rules
  command -v augenrules >/dev/null && sudo augenrules --load || true
fi

sudo install -d -m 0700 /var/lib/devin-xdr
sudo env DEVIN_XDR_BOOT_ID=golden-image DEVIN_XDR_HOST_ID=golden-image DEVIN_XDR_REMOTE_ID=golden-image DEVIN_XDR_SESSION_ID=golden-image \
  /usr/local/bin/otelcol-contrib validate --config="$DEVIN_XDR_CONFIG_PATH"
sudo systemctl daemon-reload
sudo systemctl enable devin-xdr.service
sudo systemctl stop devin-xdr.service 2>/dev/null || true
sudo rm -rf /var/lib/devin-xdr

echo "devin-xdr enabled for boot; golden-image identity and queue removed"
