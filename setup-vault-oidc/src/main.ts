import * as core from "@actions/core";
import * as fs from "fs";
import * as path from "path";
import { run, writeFileWithSudo, exportVariable, getArch, commandExists } from "../../shared/drs";
import { installDevinOidcCli } from "../../shared/devin-oidc-cli";

/**
 * Shell script installed as the Vault token helper. On `get`, it exchanges a
 * Devin OIDC token for a Vault client token via the JWT auth method's login
 * endpoint and caches the result. On `store` / `erase`, it maintains the
 * cache so that `vault login` results are honoured.
 */
function tokenHelperScript(inputs: {
  vaultAddr: string;
  role: string;
  authMount: string;
  audience: string;
  subjectKeys: string;
  vaultNamespace: string;
}): string {
  const nsHeader = inputs.vaultNamespace
    ? `  -H "X-Vault-Namespace: ${inputs.vaultNamespace}" \\\n`
    : "";
  return `#!/usr/bin/env bash
set -euo pipefail

# devin-oidc-vault-token-helper: Vault token helper that authenticates via
# Devin OIDC -> Vault JWT auth. Re-invoked by the vault CLI on each command.

VAULT_ADDR="${inputs.vaultAddr}"
ROLE="${inputs.role}"
AUTH_MOUNT="${inputs.authMount}"
AUDIENCE="${inputs.audience}"
SUBJECT_KEYS="${inputs.subjectKeys}"
CACHE_FILE="\${HOME:-/home/ubuntu}/.vault-token"
CACHE_TTL=300  # seconds — re-auth when cache is older than this

die() { echo "devin-oidc-vault: $1" >&2; exit 1; }

json_field() {
  printf '%s' "$1" | grep -o "\\"$2\\"[[:space:]]*:[[:space:]]*\\"[^\\"]*\\"" | head -1 | sed 's/.*:[[:space:]]*"\\(.*\\)"/\\1/'
}

do_login() {
  local jwt resp token errors
  jwt=$(devin-oidc token --audience "$AUDIENCE" --subject-keys "$SUBJECT_KEYS") \\
    || die "failed to obtain OIDC token"
  resp=$(curl -sS --connect-timeout 5 --max-time 30 \\
${nsHeader}    -X POST "$VAULT_ADDR/v1/auth/$AUTH_MOUNT/login" \\
    -d "{\\"role\\":\\"$ROLE\\",\\"jwt\\":\\"$jwt\\"}") \\
    || die "Vault login request failed"
  token=$(json_field "$resp" client_token)
  if [ -z "$token" ]; then
    errors=$(printf '%s' "$resp" | grep -o '"errors"[[:space:]]*:[[:space:]]*\\[[^]]*\\]' | head -1 || true)
    die "Vault login failed: \${errors:-$resp}"
  fi
  printf '%s' "$token" > "$CACHE_FILE"
  chmod 600 "$CACHE_FILE"
  printf '%s' "$token"
}

case "\${1:-}" in
  get)
    if [ -f "$CACHE_FILE" ]; then
      age=$(( $(date +%s) - $(stat -c %Y "$CACHE_FILE" 2>/dev/null || echo 0) ))
      if [ "$age" -lt "$CACHE_TTL" ]; then
        cat "$CACHE_FILE"
        exit 0
      fi
    fi
    do_login
    ;;
  store)
    read -r token || true
    if [ -n "\${token:-}" ]; then
      printf '%s' "$token" > "$CACHE_FILE"
      chmod 600 "$CACHE_FILE"
    fi
    ;;
  erase)
    rm -f "$CACHE_FILE"
    ;;
  *)
    echo "Usage: $0 {get|store|erase}" >&2
    exit 1
    ;;
esac
`;
}

function writeVaultConfig(helperPath: string): void {
  const homeDir = process.env.HOME || "/home/ubuntu";
  const configPath = path.join(homeDir, ".vault");

  // If ~/.vault already exists as a directory, remove it first; the Vault CLI
  // expects a plain file here for the token helper configuration.
  if (fs.existsSync(configPath) && fs.statSync(configPath).isDirectory()) {
    core.warning(`${configPath} exists as a directory; replacing with config file`);
    fs.rmSync(configPath, { recursive: true });
  }

  fs.writeFileSync(configPath, `token_helper = "${helperPath}"\n`);
  core.info(`Configured Vault token helper in ${configPath}`);
}

async function installVaultCli(version: string): Promise<void> {
  if (await commandExists("vault")) {
    const current = await run("vault version", { silent: true });
    core.info(`Vault CLI already installed: ${current}`);
    return;
  }

  const arch = await getArch();
  const goArch = arch === "arm64" ? "arm64" : "amd64";
  const url = `https://releases.hashicorp.com/vault/${version}/vault_${version}_linux_${goArch}.zip`;
  core.info(`Installing Vault CLI ${version} from ${url}`);
  await run(`curl -fsSL "${url}" -o /tmp/vault.zip`);
  await run("sudo unzip -oq /tmp/vault.zip -d /usr/local/bin");
  await run("sudo chmod 755 /usr/local/bin/vault");
  await run("rm -f /tmp/vault.zip");
  const installed = await run("vault version", { silent: true });
  core.info(`Installed: ${installed}`);
}

async function main(): Promise<void> {
  try {
    const vaultAddr = core.getInput("vault-addr", { required: true });
    const role = core.getInput("role", { required: true });
    const authMount = core.getInput("auth-mount") || "jwt";
    const audience = core.getInput("audience") || vaultAddr;
    const subjectKeys = core.getInput("subject-keys") || "org_id";
    const vaultNamespace = core.getInput("vault-namespace");
    const shouldInstallVault = core.getInput("install-vault") !== "false";
    const vaultVersion = core.getInput("vault-version") || "1.17.2";

    await installDevinOidcCli();

    if (shouldInstallVault) {
      await installVaultCli(vaultVersion);
    }

    const helperPath = "/usr/local/bin/devin-oidc-vault-token-helper";
    await writeFileWithSudo(
      helperPath,
      tokenHelperScript({ vaultAddr, role, authMount, audience, subjectKeys, vaultNamespace }),
    );
    await run(`sudo chmod 755 "${helperPath}"`);

    writeVaultConfig(helperPath);

    exportVariable("VAULT_ADDR", vaultAddr);
    if (vaultNamespace) {
      exportVariable("VAULT_NAMESPACE", vaultNamespace);
    }

    core.info(
      "HashiCorp Vault OIDC authentication configured. " +
      "The vault CLI will automatically obtain tokens via Devin OIDC.",
    );
  } catch (error: unknown) {
    core.setFailed(error instanceof Error ? error.message : String(error));
  }
}

main();
