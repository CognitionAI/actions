import * as core from "@actions/core";
import * as fs from "fs";
import * as path from "path";
import { run, writeFileWithSudo } from "../../shared/drs";
import { installDevinOidcCli } from "../../shared/devin-oidc-cli";

function credentialHelperScript(inputs: {
  roleArn: string;
  audience: string;
  subjectKeys: string;
  sessionName: string;
  durationSeconds: string;
}): string {
  // The exchanged OIDC token is short-lived (~1 minute), so a static
  // web_identity_token_file would go stale. credential_process is re-run by
  // the AWS CLI/SDKs whenever the assumed-role credentials expire, fetching a
  // fresh token each time. AssumeRoleWithWebIdentity is unsigned, so the
  // helper needs no pre-existing AWS credentials.
  return `#!/usr/bin/env bash
set -euo pipefail
token=$(devin-oidc token --audience "${inputs.audience}" --subject-keys "${inputs.subjectKeys}")
exec aws sts assume-role-with-web-identity \\
  --role-arn "${inputs.roleArn}" \\
  --role-session-name "${inputs.sessionName}" \\
  --web-identity-token "$token" \\
  --duration-seconds ${inputs.durationSeconds} \\
  --query 'Credentials.{Version: \`1\`, AccessKeyId: AccessKeyId, SecretAccessKey: SecretAccessKey, SessionToken: SessionToken, Expiration: Expiration}' \\
  --output json
`;
}

function appendProfile(profile: string, helperPath: string, region: string): void {
  const header = profile === "default" ? "[default]" : `[profile ${profile}]`;
  const configPath = path.join(process.env.HOME || "/home/ubuntu", ".aws", "config");
  let config = "";
  if (fs.existsSync(configPath)) config = fs.readFileSync(configPath, "utf8");
  if (config.includes(header)) {
    core.info(`AWS profile ${header} already exists in ${configPath}; leaving config unchanged`);
    return;
  }
  let section = `${header}\ncredential_process = ${helperPath}\n`;
  if (region) section += `region = ${region}\n`;
  if (config && !config.endsWith("\n")) config += "\n";
  fs.mkdirSync(path.dirname(configPath), { recursive: true });
  fs.writeFileSync(configPath, config + section);
  core.info(`Configured AWS profile ${header} in ${configPath}`);
}

async function main(): Promise<void> {
  try {
    const roleArn = core.getInput("role-arn", { required: true });
    const region = core.getInput("region");
    const profile = core.getInput("profile") || "default";
    const audience = core.getInput("audience") || "sts.amazonaws.com";
    const subjectKeys = core.getInput("subject-keys") || "org_id";
    const sessionName = core.getInput("session-name") || "devin";
    const durationSeconds = core.getInput("duration-seconds") || "3600";

    await installDevinOidcCli();

    const helperPath = `/usr/local/bin/devin-oidc-aws-credentials-${profile}`;
    await writeFileWithSudo(
      helperPath,
      credentialHelperScript({ roleArn, audience, subjectKeys, sessionName, durationSeconds }),
    );
    await run(`sudo chmod 755 "${helperPath}"`);

    appendProfile(profile, helperPath, region);
  } catch (error: unknown) {
    core.setFailed(error instanceof Error ? error.message : String(error));
  }
}

main();
