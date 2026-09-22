#!/usr/bin/env bash
set -euo pipefail

tmp_dir=$(mktemp -d)
trap 'rm -rf "$tmp_dir"' EXIT
url="https://github.com/open-telemetry/opentelemetry-collector-releases/releases/download/v${DEVIN_XDR_COLLECTOR_VERSION}/otelcol-contrib_${DEVIN_XDR_COLLECTOR_VERSION}_darwin_${DEVIN_XDR_ARCH}.tar.gz"

curl -fsSL --retry 3 "$url" -o "$tmp_dir/collector.tar.gz"
curl -fsSL --retry 3 "$url.sha256" -o "$tmp_dir/collector.tar.gz.sha256"
test "$(shasum -a 256 "$tmp_dir/collector.tar.gz" | cut -d ' ' -f 1)" = "$(cut -d ' ' -f 1 "$tmp_dir/collector.tar.gz.sha256")"
tar -xzf "$tmp_dir/collector.tar.gz" -C "$tmp_dir" otelcol-contrib

action_root=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
sudo launchctl bootout system/ai.devin.xdr 2>/dev/null || true
sudo install -d -m 0755 "$DEVIN_XDR_INSTALL_DIR" "$DEVIN_XDR_CONFIG_DIR" "$(dirname "$DEVIN_XDR_LOG_PATH")"
sudo install -d -m 0700 "$DEVIN_XDR_STATE_DIR"
sudo install -m 0755 "$tmp_dir/otelcol-contrib" "$DEVIN_XDR_INSTALL_DIR/otelcol-contrib"
sudo install -m 0755 "$action_root/vendor/macos-start.sh" "$DEVIN_XDR_INSTALL_DIR/start.sh"
sudo install -m 0600 "$DEVIN_XDR_TEMP_CONFIG" "$DEVIN_XDR_CONFIG_PATH"
sudo install -m 0644 "$action_root/vendor/ai.devin.xdr.plist" /Library/LaunchDaemons/ai.devin.xdr.plist

sudo rm -f "$DEVIN_XDR_CONFIG_DIR/oidc-audience" "$DEVIN_XDR_CONFIG_DIR/oidc-subject-keys"
if [[ -n "$DEVIN_XDR_TEMP_OIDC_AUDIENCE" ]]; then
  sudo install -m 0600 "$DEVIN_XDR_TEMP_OIDC_AUDIENCE" "$DEVIN_XDR_CONFIG_DIR/oidc-audience"
  sudo install -m 0600 "$DEVIN_XDR_TEMP_OIDC_SUBJECT_KEYS" "$DEVIN_XDR_CONFIG_DIR/oidc-subject-keys"
fi

sudo rm -f /etc/sudoers.d/zz-devin-xdr
if [[ "$DEVIN_XDR_COLLECT_NATIVE_AUDIT" == "true" ]]; then
  sudo install -m 0440 "$action_root/vendor/devin-xdr.sudoers" /etc/sudoers.d/zz-devin-xdr
  sudo visudo -c
fi

sudo env DEVIN_XDR_BOOT_ID=golden-image DEVIN_XDR_HOST_ID=golden-image DEVIN_XDR_REMOTE_ID=golden-image DEVIN_XDR_SESSION_ID=golden-image \
  "$DEVIN_XDR_INSTALL_DIR/otelcol-contrib" validate --config="$DEVIN_XDR_CONFIG_PATH"
sudo plutil -lint /Library/LaunchDaemons/ai.devin.xdr.plist
sudo launchctl enable system/ai.devin.xdr
sudo rm -rf "$DEVIN_XDR_STATE_DIR"
echo "devin-xdr enabled for boot; golden-image identity and queue removed"
