/**
 * Installer for the `devin-oidc` CLI, shared by the setup-devin-oidc and
 * setup-aws-oidc actions.
 *
 * The CLI reads the session's general OIDC token (written by the brain to
 * /opt/.devin/oidc_token) and exchanges it for a short-lived audience-scoped
 * token via the webserver's RFC 8693 endpoint (POST {issuer}/api/oidc/token;
 * the webapp CDN forwards /api/* to the webserver, stripping the prefix).
 * Orgs on dedicated gitproxy tenants must route the exchange through the
 * tenant gitproxy (which attaches the attestation header), so the CLI falls
 * back to the git-manager host when the server requires the git proxy.
 */

import { run, writeFileWithSudo } from "./drs";

export const DEVIN_OIDC_CLI_PATH = "/usr/local/bin/devin-oidc";

const DEVIN_OIDC_SCRIPT = `#!/usr/bin/env bash
# devin-oidc: exchange the Devin session's general OIDC token for a
# short-lived audience-scoped OIDC token (RFC 8693 token exchange).
set -euo pipefail

TOKEN_FILE="\${DEVIN_OIDC_TOKEN_FILE:-/opt/.devin/oidc_token}"

usage() {
  cat <<'EOF'
Usage:
  devin-oidc token --audience <aud> [--subject-keys "<keys>"] [--exchange-url <url>]
  devin-oidc print-general-token

Commands:
  token                Exchange the general token and print the resulting token
  print-general-token  Print the raw general token (for debugging)

Options:
  --audience       Audience claim for the exchanged token (required)
  --subject-keys   Space-delimited claim names composing the token's sub
                   (default: "org_id")
  --exchange-url   Token exchange endpoint. Defaults to {iss}/api/oidc/token
                   from the general token, with a gitproxy fallback via the
                   git-manager host when the server requires the git proxy.

Environment:
  DEVIN_OIDC_TOKEN_FILE     General token path (default: /opt/.devin/oidc_token)
  DEVIN_OIDC_EXCHANGE_URL   Default exchange endpoint override
EOF
}

die() {
  echo "devin-oidc: $1" >&2
  exit 1
}

read_general_token() {
  [ -r "$TOKEN_FILE" ] || die "no general OIDC token at $TOKEN_FILE (is this a Devin session?)"
  cat "$TOKEN_FILE"
}

b64url_decode() {
  local s="\${1//-/+}"
  s="\${s//_//}"
  while [ $((\${#s} % 4)) -ne 0 ]; do s="$s="; done
  printf '%s' "$s" | base64 -d
}

# json_field <json> <key>: extract a top-level string field without jq.
json_field() {
  printf '%s' "$1" | grep -o "\\"$2\\"[[:space:]]*:[[:space:]]*\\"[^\\"]*\\"" | head -1 | sed 's/.*:[[:space:]]*"\\(.*\\)"/\\1/'
}

issuer_from_token() {
  local payload
  payload=$(printf '%s' "$1" | cut -d. -f2)
  json_field "$(b64url_decode "$payload")" iss
}

# The tenant gitproxy serves /oidc/ on the git-manager host and forwards it to
# the webserver with the attestation header attached. The git-manager host is
# "git-manager." + the issuer's base domain (e.g. app.devin.ai -> devin.ai).
gitproxy_exchange_url() {
  local host base
  host=$(printf '%s' "$1" | sed 's|^https\\?://||; s|/.*||')
  base="\${host#*.}"
  echo "https://git-manager.$base/oidc/token"
}

# try_exchange <url>: on success print the exchanged token and return 0.
try_exchange() {
  local url="$1" out http body
  out=$(curl -sS --connect-timeout 5 --max-time 30 -w '\\n%{http_code}' -X POST "$url" \\
    --data-urlencode "grant_type=urn:ietf:params:oauth:grant-type:token-exchange" \\
    --data-urlencode "subject_token=$GENERAL_TOKEN" \\
    --data-urlencode "subject_token_type=urn:ietf:params:oauth:token-type:jwt" \\
    --data-urlencode "audience=$AUDIENCE" \\
    --data-urlencode "subject_keys=$SUBJECT_KEYS" 2>&1) || {
    LAST_ERROR="request to $url failed: $out"
    return 1
  }
  http="\${out##*$'\\n'}"
  body="\${out%$'\\n'*}"
  if [ "$http" != "200" ]; then
    LAST_ERROR="HTTP $http from $url: $body"
    return 1
  fi
  local token
  token=$(json_field "$body" access_token)
  [ -n "$token" ] || { LAST_ERROR="no access_token in response from $url"; return 1; }
  echo "$token"
}

cmd_token() {
  AUDIENCE=""
  SUBJECT_KEYS="org_id"
  local exchange_url="\${DEVIN_OIDC_EXCHANGE_URL:-}"
  while [ $# -gt 0 ]; do
    case "$1" in
      --audience) AUDIENCE="$2"; shift 2 ;;
      --subject-keys) SUBJECT_KEYS="$2"; shift 2 ;;
      --exchange-url) exchange_url="$2"; shift 2 ;;
      *) die "unknown option: $1" ;;
    esac
  done
  [ -n "$AUDIENCE" ] || die "--audience is required"

  GENERAL_TOKEN=$(read_general_token)
  LAST_ERROR=""

  if [ -n "$exchange_url" ]; then
    try_exchange "$exchange_url" || die "$LAST_ERROR"
    return
  fi

  local issuer
  issuer=$(issuer_from_token "$GENERAL_TOKEN")
  [ -n "$issuer" ] || die "could not read iss claim from the general token"
  try_exchange "$issuer/api/oidc/token" && return
  local direct_error="$LAST_ERROR"
  case "$direct_error" in
    *"git proxy"*)
      try_exchange "$(gitproxy_exchange_url "$issuer")" && return
      die "token exchange failed. direct: $direct_error; gitproxy: $LAST_ERROR"
      ;;
  esac
  die "token exchange failed: $direct_error"
}

case "\${1:-}" in
  token) shift; cmd_token "$@" ;;
  print-general-token) read_general_token; echo ;;
  -h|--help|help|"") usage; [ "\${1:-}" = "" ] && exit 1 || exit 0 ;;
  *) die "unknown command: $1 (see devin-oidc --help)" ;;
esac
`;

export async function installDevinOidcCli(): Promise<void> {
  await writeFileWithSudo(DEVIN_OIDC_CLI_PATH, DEVIN_OIDC_SCRIPT);
  await run(`sudo chmod 755 "${DEVIN_OIDC_CLI_PATH}"`);
}
