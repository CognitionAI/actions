import * as core from "@actions/core";
import * as fs from "fs";
import { run, tryRun, writeFileWithSudo, exportVariable, commandExists } from "../../shared/drs";
import { installDevinOidcCli } from "../../shared/devin-oidc-cli";

/**
 * Refreshes the Azure federated token file and, when needed, logs the Azure
 * CLI in with a fresh client assertion. The Azure SDKs consume the token file
 * through WorkloadIdentityCredential or DefaultAzureCredential.
 */
function refreshScript(inputs: {
  clientId: string;
  tenantId: string;
  subscriptionId: string;
  audience: string;
  subjectKeys: string;
}): string {
  return `#!/usr/bin/env bash
set -euo pipefail

CLIENT_ID="${inputs.clientId}"
TENANT_ID="${inputs.tenantId}"
SUBSCRIPTION_ID="${inputs.subscriptionId}"
AUDIENCE="${inputs.audience}"
SUBJECT_KEYS="${inputs.subjectKeys}"
TOKEN_FILE="\${HOME:-/home/ubuntu}/.azure-federated-token"
MARKER="\${HOME:-/home/ubuntu}/.azure-oidc-login-stamp"
LOGIN_TTL=3000

die() { echo "devin-oidc-azure: $1" >&2; exit 1; }

jwt=$(devin-oidc token --audience "$AUDIENCE" --subject-keys "$SUBJECT_KEYS") \\
  || die "failed to obtain OIDC token from Devin"

printf '%s' "$jwt" > "$TOKEN_FILE"
chmod 600 "$TOKEN_FILE"

if [ "\${1:-}" != "--token-only" ]; then
  should_login=false
  if [ "\${1:-}" = "--force" ] || [ ! -f "$MARKER" ]; then
    should_login=true
  else
    age=$(( $(date +%s) - $(stat -c %Y "$MARKER" 2>/dev/null || echo 0) ))
    if [ "$age" -ge "$LOGIN_TTL" ]; then
      should_login=true
    fi
  fi

  if [ "$should_login" = true ] && [ -x /usr/local/bin/.az-real ]; then
    /usr/local/bin/.az-real login \\
      --service-principal \\
      --username "$CLIENT_ID" \\
      --tenant "$TENANT_ID" \\
      --federated-token "$jwt" \\
      --allow-no-subscriptions \\
      --output none \\
      || die "Azure CLI login failed"
    if [ -n "$SUBSCRIPTION_ID" ]; then
      /usr/local/bin/.az-real account set --subscription "$SUBSCRIPTION_ID" \\
        || die "Azure subscription selection failed"
    fi
    touch "$MARKER"
  fi
fi
`;
}

/**
 * Wrapper installed at /usr/local/bin/az. It refreshes the federated token
 * before ordinary Azure CLI commands while leaving login/logout/account
 * commands untouched so callers can use the native CLI behavior directly.
 */
function wrapperScript(): string {
  return `#!/usr/bin/env bash
set -uo pipefail

REAL_AZ=/usr/local/bin/.az-real

case "\${1:-}" in
  login|logout|account)
    exec "$REAL_AZ" "$@"
    ;;
esac

/usr/local/bin/devin-oidc-azure-refresh >/dev/null 2>&1 || true
exec "$REAL_AZ" "$@"
`;
}

async function installAzureCli(): Promise<void> {
  core.info("Installing Azure CLI");
  await run("curl -sL https://aka.ms/InstallAzureCLIDeb | sudo bash");
  const installed = await run("az version --output json", { silent: true });
  core.info(`Installed Azure CLI: ${installed}`);
}

async function resolveRealAz(): Promise<boolean> {
  let azPath = (await tryRun("command -v az", { silent: true })).stdout.trim();
  if (!azPath) {
    return false;
  }

  const realAzPath = "/usr/local/bin/.az-real";
  if (await commandExists(realAzPath)) {
    return true;
  }

  if (azPath === "/usr/local/bin/az") {
    try {
      const wrapper = fs.readFileSync(azPath, "utf8");
      const realAz = wrapper.match(/^REAL_AZ=(\S+)$/m)?.[1];
      if (!realAz || realAz === azPath) {
        core.warning("Could not resolve the real Azure CLI behind /usr/local/bin/az");
        return false;
      }
      azPath = realAz;
    } catch {
      core.warning("Could not read the existing /usr/local/bin/az wrapper");
      return false;
    }
  }

  await run(`sudo ln -sf "${azPath}" "${realAzPath}"`);
  return true;
}

async function main(): Promise<void> {
  try {
    const clientId = core.getInput("client-id", { required: true });
    const tenantId = core.getInput("tenant-id", { required: true });
    const subscriptionId = core.getInput("subscription-id");
    const audience = core.getInput("audience") || "api://AzureADTokenExchange";
    const subjectKeys = core.getInput("subject-keys") || "org_id";
    const shouldInstallAzureCli = core.getInput("install-azure-cli") !== "false";

    // 1. Install devin-oidc CLI
    await installDevinOidcCli();

    // 2. Install Azure CLI when requested and absent
    let azAvailable = await commandExists("az");
    if (!azAvailable && shouldInstallAzureCli) {
      await installAzureCli();
      azAvailable = await commandExists("az");
    } else if (azAvailable) {
      const current = await run("az version --output json", { silent: true });
      core.info(`Azure CLI already installed: ${current}`);
    } else {
      core.warning("Azure CLI not found; skipping Azure CLI wrapper and login");
    }

    // 3. Preserve the real Azure CLI before installing the wrapper
    const hasRealAz = azAvailable && (await resolveRealAz());

    // 4. Install the refresh helper
    const refreshPath = "/usr/local/bin/devin-oidc-azure-refresh";
    await writeFileWithSudo(
      refreshPath,
      refreshScript({ clientId, tenantId, subscriptionId, audience, subjectKeys }),
    );
    await run(`sudo chmod 755 "${refreshPath}"`);

    // 5. Install the Azure CLI wrapper only when a real CLI is available
    if (hasRealAz) {
      await writeFileWithSudo("/usr/local/bin/az", wrapperScript());
      await run("sudo chmod 755 /usr/local/bin/az");
    }

    // 6. Initial login is non-fatal; the wrapper retries at runtime
    const { exitCode: refreshExit } = await tryRun(`${refreshPath} --force`, { silent: true });
    if (refreshExit !== 0) {
      core.warning(
        "Initial Azure OIDC login failed — auth will be attempted on the first Azure CLI command",
      );
    }

    // 7. Configure Azure SDK workload identity environment variables
    const tokenFile = `${process.env.HOME || "/home/ubuntu"}/.azure-federated-token`;
    exportVariable("AZURE_CLIENT_ID", clientId);
    exportVariable("AZURE_TENANT_ID", tenantId);
    exportVariable("AZURE_FEDERATED_TOKEN_FILE", tokenFile);
    exportVariable("AZURE_AUTHORITY_HOST", "https://login.microsoftonline.com");
    if (subscriptionId) {
      exportVariable("AZURE_SUBSCRIPTION_ID", subscriptionId);
    }

    core.info(
      "Azure OIDC authentication configured. Azure CLI and Azure SDKs will obtain credentials via Devin OIDC.",
    );
  } catch (error: unknown) {
    core.setFailed(error instanceof Error ? error.message : String(error));
  }
}

main();
