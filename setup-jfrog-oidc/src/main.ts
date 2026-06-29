import * as core from "@actions/core";
import { run, tryRun, writeFileWithSudo, exportVariable, getArch, commandExists } from "../../shared/drs";
import { installDevinOidcCli } from "../../shared/devin-oidc-cli";

/**
 * Single-quote a value for safe embedding in a generated bash script. Wraps the
 * value in single quotes and escapes any embedded single quotes, so the result
 * is a single shell word that cannot break out of its quoting (no command or
 * quote injection, no variable/glob expansion).
 */
function shellQuote(value: string): string {
  return `'${value.replace(/'/g, "'\\''")}'`;
}

/**
 * Ensure an input is a well-formed https:// URL. Throws on anything else so a
 * hostile value cannot be used as the OIDC token-exchange endpoint.
 */
function validateHttpsUrl(name: string, value: string): string {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`${name} must be a valid URL, got: ${value}`);
  }
  if (parsed.protocol !== "https:") {
    throw new Error(`${name} must use https://, got: ${value}`);
  }
  return value;
}

/**
 * Restrict an input to a conservative character set. Throws otherwise.
 */
function validatePattern(name: string, value: string, pattern: RegExp): string {
  if (!pattern.test(value)) {
    throw new Error(`${name} contains disallowed characters, got: ${value}`);
  }
  return value;
}

/**
 * Shell script that exchanges a Devin OIDC token for a JFrog access token
 * and updates the jf CLI config. Called by the jf wrapper on auth failure,
 * or directly via `devin-oidc-jfrog-refresh`.
 */
function refreshScript(inputs: {
  jfrogUrl: string;
  providerName: string;
  audience: string;
  subjectKeys: string;
  serverId: string;
}): string {
  return `#!/usr/bin/env bash
set -euo pipefail

JFROG_URL=${shellQuote(inputs.jfrogUrl)}
PROVIDER_NAME=${shellQuote(inputs.providerName)}
AUDIENCE=${shellQuote(inputs.audience)}
SUBJECT_KEYS=${shellQuote(inputs.subjectKeys)}
SERVER_ID=${shellQuote(inputs.serverId)}

die() { echo "devin-oidc-jfrog: $1" >&2; exit 1; }

json_field() {
  printf '%s' "$1" | grep -o "\\"$2\\"[[:space:]]*:[[:space:]]*\\"[^\\"]*\\"" | head -1 | sed 's/.*:[[:space:]]*"\\(.*\\)"/\\1/'
}

# 1. Get audience-scoped OIDC token from Devin
jwt=$(devin-oidc token --audience "$AUDIENCE" --subject-keys "$SUBJECT_KEYS") \\
  || die "failed to obtain OIDC token from Devin"

# 2. Exchange for JFrog access token
resp=$(curl -sS --connect-timeout 5 --max-time 30 \\
  -X POST "$JFROG_URL/access/api/v1/oidc/token" \\
  -H "Content-Type: application/json" \\
  -d "{\\"grant_type\\":\\"urn:ietf:params:oauth:grant-type:token-exchange\\",\\"subject_token_type\\":\\"urn:ietf:params:oauth:token-type:id_token\\",\\"subject_token\\":\\"$jwt\\",\\"provider_name\\":\\"$PROVIDER_NAME\\"}") \\
  || die "JFrog token exchange request failed"

token=$(json_field "$resp" access_token)
[ -n "$token" ] || die "JFrog token exchange failed: $resp"

# 3. Update jf CLI config
/usr/local/bin/.jf-real config add "$SERVER_ID" \\
  --url="$JFROG_URL" \\
  --access-token="$token" \\
  --interactive=false \\
  --overwrite 2>/dev/null

printf '%s' "$token"
`;
}

/**
 * Wrapper script installed at /usr/local/bin/jf. Delegates to the real jf
 * binary and retries once after refreshing credentials on auth failure.
 */
function wrapperScript(): string {
  return `#!/usr/bin/env bash
set -uo pipefail

REAL_JF=/usr/local/bin/.jf-real

# Capture stdout and stderr separately to preserve fd separation
stdout_file=$(mktemp)
stderr_file=$(mktemp)
cleanup() { rm -f "$stdout_file" "$stderr_file"; }
trap cleanup EXIT

"$REAL_JF" "$@" >"$stdout_file" 2>"$stderr_file"
rc=$?

if [ $rc -eq 0 ]; then
  cat "$stdout_file"
  cat "$stderr_file" >&2
  exit 0
fi

# Check if failure is auth-related (check both stdout and stderr)
if grep -qiE '401|403|unauthorized|forbidden|token.*expir|credentials.*invalid' "$stdout_file" "$stderr_file" 2>/dev/null; then
  # Attempt token refresh
  if /usr/local/bin/devin-oidc-jfrog-refresh >/dev/null 2>&1; then
    # Retry with fresh credentials — exec preserves fd separation naturally
    exec "$REAL_JF" "$@"
  fi
fi

# Not auth-related or refresh failed — replay original output to correct fds
cat "$stdout_file"
cat "$stderr_file" >&2
exit $rc
`;
}

async function installJfrogCli(version: string): Promise<void> {
  if (await commandExists(".jf-real")) {
    const current = await run("/usr/local/bin/.jf-real --version", { silent: true });
    core.info(`JFrog CLI already installed: ${current}`);
    return;
  }

  if (await commandExists("jf")) {
    // Move existing jf to .jf-real before installing wrapper
    const jfPath = (await run("which jf", { silent: true })).trim();
    if (jfPath) {
      await run(`sudo mv "${jfPath}" /usr/local/bin/.jf-real`);
      const current = await run("/usr/local/bin/.jf-real --version", { silent: true });
      core.info(`Moved existing JFrog CLI to .jf-real: ${current}`);
      return;
    }
  }

  const arch = await getArch();
  const goArch = arch === "arm64" ? "arm64" : "amd64";
  const url = `https://releases.jfrog.io/artifactory/jfrog-cli/v2-jf/${version}/jfrog-cli-linux-${goArch}/jf`;
  core.info(`Installing JFrog CLI ${version} from ${url}`);
  await run(`sudo curl -fsSL "${url}" -o /usr/local/bin/.jf-real`);
  await run("sudo chmod 755 /usr/local/bin/.jf-real");
  const installed = await run("/usr/local/bin/.jf-real --version", { silent: true });
  core.info(`Installed: ${installed}`);
}

async function main(): Promise<void> {
  try {
    const jfrogUrl = validateHttpsUrl(
      "jfrog-url",
      core.getInput("jfrog-url", { required: true }),
    );
    const providerName = validatePattern(
      "provider-name",
      core.getInput("provider-name", { required: true }),
      /^[A-Za-z0-9._-]+$/,
    );
    // audience may be a custom identifier or a URL; it defaults to jfrog-url.
    // It is shell-quoted at interpolation time, so no character restriction is
    // imposed here, but it must not be empty.
    const audience = core.getInput("audience") || jfrogUrl;
    const subjectKeys = validatePattern(
      "subject-keys",
      core.getInput("subject-keys") || "org_id",
      /^[A-Za-z0-9._ -]+$/,
    );
    const serverId = validatePattern(
      "server-id",
      core.getInput("server-id") || "default",
      /^[A-Za-z0-9._-]+$/,
    );
    const shouldInstall = core.getInput("install-jfrog-cli") !== "false";
    const cliVersion = validatePattern(
      "jfrog-cli-version",
      core.getInput("jfrog-cli-version") || "2.72.2",
      /^[A-Za-z0-9._-]+$/,
    );

    // 1. Install devin-oidc CLI
    await installDevinOidcCli();

    // 2. Install JFrog CLI (as .jf-real)
    if (shouldInstall) {
      await installJfrogCli(cliVersion);
    } else {
      // Move existing jf to .jf-real if not already done
      if (!(await commandExists(".jf-real")) && (await commandExists("jf"))) {
        const jfPath = (await run("which jf", { silent: true })).trim();
        if (jfPath && jfPath !== "/usr/local/bin/.jf-real") {
          await run(`sudo mv "${jfPath}" /usr/local/bin/.jf-real`);
        }
      }
    }

    // 3. Install refresh helper
    await writeFileWithSudo(
      "/usr/local/bin/devin-oidc-jfrog-refresh",
      refreshScript({ jfrogUrl, providerName, audience, subjectKeys, serverId }),
    );
    await run("sudo chmod 755 /usr/local/bin/devin-oidc-jfrog-refresh");

    // 4. Install jf wrapper
    await writeFileWithSudo("/usr/local/bin/jf", wrapperScript());
    await run("sudo chmod 755 /usr/local/bin/jf");

    // 5. Initial token exchange (non-fatal — wrapper handles refresh at runtime)
    const { exitCode: refreshExit, stdout: refreshOut } = await tryRun("/usr/local/bin/devin-oidc-jfrog-refresh", { silent: true });
    if (refreshExit !== 0) {
      core.warning("Initial token exchange failed — auth will be attempted on first jf command via the wrapper");
    } else if (!refreshOut.trim()) {
      core.warning("Initial token exchange returned empty — auth may not work until the session has a valid OIDC token");
    }

    // 6. Export JFROG_URL
    exportVariable("JFROG_URL", jfrogUrl);

    core.info(
      "JFrog OIDC configured. Use 'jf npm install', 'jf docker pull', etc. " +
      "Auth refreshes automatically on 401.",
    );
  } catch (error: unknown) {
    core.setFailed(error instanceof Error ? error.message : String(error));
  }
}

main();
