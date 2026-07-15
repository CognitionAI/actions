import * as core from "@actions/core";
import { run, writeFileWithSudo, exportVariable, getArch, commandExists } from "../../shared/drs";
import { installDevinOidcCli } from "../../shared/devin-oidc-cli";

/**
 * Shell script installed as the executable credential source for GCP
 * Workload Identity Federation. Re-invoked by gcloud/Google SDKs whenever a
 * fresh subject token is needed; the exchanged Devin OIDC token is
 * short-lived, so a static credential file would go stale.
 */
function credentialHelperScript(inputs: {
  audience: string;
  subjectKeys: string;
}): string {
  return `#!/usr/bin/env bash
set -euo pipefail

# devin-oidc-gcp-token-helper: executable credential source for GCP Workload
# Identity Federation. Prints the executable-sourced credential JSON expected
# by gcloud and the Google Cloud client libraries.

AUDIENCE="${inputs.audience}"
SUBJECT_KEYS="${inputs.subjectKeys}"

die() { echo "devin-oidc-gcp: $1" >&2; exit 1; }

b64url_decode() {
  local s="\${1//-/+}"
  s="\${s//_//}"
  while [ $((\${#s} % 4)) -ne 0 ]; do s="$s="; done
  printf '%s' "$s" | base64 -d
}

token=$(devin-oidc token --audience "$AUDIENCE" --subject-keys "$SUBJECT_KEYS") \\
  || die "failed to obtain OIDC token"

payload=$(b64url_decode "$(printf '%s' "$token" | cut -d. -f2)")
exp=$(printf '%s' "$payload" | grep -o '"exp"[[:space:]]*:[[:space:]]*[0-9]*' | head -1 | grep -o '[0-9]*$')
[ -n "$exp" ] || die "could not read exp claim from the exchanged token"

printf '{"version":1,"success":true,"token_type":"urn:ietf:params:oauth:token-type:jwt","id_token":"%s","expiration_time":%s}' "$token" "$exp"
`;
}

/**
 * External account (Workload Identity Federation) credential configuration
 * consumed by gcloud and the Google Cloud client libraries via
 * GOOGLE_APPLICATION_CREDENTIALS.
 */
function credentialConfig(inputs: {
  workloadIdentityProvider: string;
  serviceAccount: string;
  helperPath: string;
}): string {
  const config: Record<string, unknown> = {
    type: "external_account",
    audience: `//iam.googleapis.com/${inputs.workloadIdentityProvider}`,
    subject_token_type: "urn:ietf:params:oauth:token-type:jwt",
    token_url: "https://sts.googleapis.com/v1/token",
    credential_source: {
      executable: {
        command: inputs.helperPath,
        timeout_millis: 30000,
      },
    },
  };
  if (inputs.serviceAccount) {
    config.service_account_impersonation_url =
      `https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/${inputs.serviceAccount}:generateAccessToken`;
  }
  return JSON.stringify(config, null, 2) + "\n";
}

async function installGcloudCli(): Promise<void> {
  if (await commandExists("gcloud")) {
    const current = await run("gcloud --version | head -1", { silent: true });
    core.info(`gcloud CLI already installed: ${current}`);
    return;
  }

  const arch = await getArch();
  const gcloudArch = arch === "arm64" ? "arm" : "x86_64";
  const url = `https://dl.google.com/dl/cloudsdk/channels/rapid/downloads/google-cloud-cli-linux-${gcloudArch}.tar.gz`;
  core.info(`Installing gcloud CLI from ${url}`);
  await run(`curl -fsSL "${url}" -o /tmp/google-cloud-cli.tar.gz`);
  await run("sudo tar -xzf /tmp/google-cloud-cli.tar.gz -C /usr/local");
  await run(
    "sudo ln -sf /usr/local/google-cloud-sdk/bin/gcloud /usr/local/bin/gcloud && " +
    "sudo ln -sf /usr/local/google-cloud-sdk/bin/gsutil /usr/local/bin/gsutil && " +
    "sudo ln -sf /usr/local/google-cloud-sdk/bin/bq /usr/local/bin/bq",
  );
  await run("rm -f /tmp/google-cloud-cli.tar.gz");
  const installed = await run("gcloud --version | head -1", { silent: true });
  core.info(`Installed: ${installed}`);
}

async function main(): Promise<void> {
  try {
    const workloadIdentityProvider = core.getInput("workload-identity-provider", { required: true });
    const serviceAccount = core.getInput("service-account");
    const audience =
      core.getInput("audience") || `https://iam.googleapis.com/${workloadIdentityProvider}`;
    const subjectKeys = core.getInput("subject-keys") || "org_id";
    const project = core.getInput("project");
    const shouldInstallGcloud = core.getInput("install-gcloud") !== "false";

    await installDevinOidcCli();

    if (shouldInstallGcloud) {
      await installGcloudCli();
    }

    const helperPath = "/usr/local/bin/devin-oidc-gcp-token-helper";
    await writeFileWithSudo(helperPath, credentialHelperScript({ audience, subjectKeys }));
    await run(`sudo chmod 755 "${helperPath}"`);

    const credFilePath = "/etc/devin-oidc/gcp-credentials.json";
    await writeFileWithSudo(
      credFilePath,
      credentialConfig({ workloadIdentityProvider, serviceAccount, helperPath }),
    );
    await run(`sudo chmod 644 "${credFilePath}"`);

    // Executable-sourced credentials are only honoured when this opt-in
    // variable is set.
    exportVariable("GOOGLE_EXTERNAL_ACCOUNT_ALLOW_EXECUTABLES", "1");
    exportVariable("GOOGLE_APPLICATION_CREDENTIALS", credFilePath);

    if (await commandExists("gcloud")) {
      await run(
        `GOOGLE_EXTERNAL_ACCOUNT_ALLOW_EXECUTABLES=1 gcloud auth login --cred-file="${credFilePath}" --quiet`,
      );
      if (project) {
        await run(`gcloud config set project "${project}" --quiet`);
        exportVariable("GOOGLE_CLOUD_PROJECT", project);
      }
    } else {
      core.warning("gcloud CLI not found; configured application default credentials only");
    }

    core.info(
      "Google Cloud OIDC authentication configured. " +
      "gcloud and Google Cloud SDKs will automatically obtain credentials via Devin OIDC.",
    );
  } catch (error: unknown) {
    core.setFailed(error instanceof Error ? error.message : String(error));
  }
}

main();
