import * as core from "@actions/core";
import * as exec from "@actions/exec";
import { existsSync } from "fs";
import { resolve } from "path";
import { run, tryRun } from "../../shared/drs";

const FALCONCTL = "/opt/CrowdStrike/falconctl";
const SERVICE = "falcon-sensor";
const CLOUDS = ["us-1", "us-2", "eu-1", "us-gov-1", "us-gov-2"];
const BACKENDS = ["auto", "bpf", "kernel"];

function installerPath(): string {
  const actionRoot = process.env.GITHUB_ACTION_PATH || resolve(__dirname, "..");
  const script = resolve(actionRoot, "vendor", "falcon-linux-install.sh");
  if (!existsSync(script)) {
    throw new Error(`Vendored installer not found at ${script}`);
  }
  return script;
}

function requireSecret(envName: string, purpose: string): string {
  const value = process.env[envName];
  if (!value) {
    throw new Error(
      `${purpose} not found in environment variable '${envName}'. ` +
        "Add it as an org secret (mark it build-only) or point the matching *-env input at the secret's name.",
    );
  }
  core.setSecret(value);
  return value;
}

function validateChoice(name: string, value: string, allowed: string[]): string {
  if (!allowed.includes(value)) {
    throw new Error(`Invalid ${name} '${value}'. Expected one of: ${allowed.join(", ")}`);
  }
  return value;
}

/** Runs the installer as root. Secrets travel only in the child environment (never argv or a shell) and the command line is not echoed. */
async function runInstaller(script: string, env: Record<string, string>): Promise<void> {
  const preserved = Object.keys(env).join(",");
  const exitCode = await exec.exec("sudo", [`--preserve-env=${preserved}`, "bash", script], {
    env: { ...process.env, ...env } as Record<string, string>,
    silent: true,
    ignoreReturnCode: true,
    listeners: {
      stdout: (data) => process.stdout.write(data),
      stderr: (data) => process.stderr.write(data),
    },
  });
  if (exitCode !== 0) {
    throw new Error(`falcon-linux-install.sh exited with code ${exitCode}`);
  }
}

async function verifyInstall(): Promise<void> {
  const falconctl = await tryRun(`sudo test -x ${FALCONCTL}`, { silent: true });
  if (falconctl.exitCode !== 0) {
    throw new Error(`${FALCONCTL} missing or not executable`);
  }

  const unit = await tryRun(`systemctl list-unit-files ${SERVICE}.service --no-legend`, { silent: true });
  if (unit.exitCode !== 0 || !unit.stdout.includes(`${SERVICE}.service`)) {
    throw new Error(`${SERVICE}.service unit not found`);
  }

  // Each session VM boots from the snapshot and must start the sensor to register as a new host.
  await run(`sudo systemctl enable ${SERVICE}`, { silent: true });
  const enabled = (await run(`systemctl is-enabled ${SERVICE}`, { silent: true })).trim();
  if (enabled !== "enabled") {
    throw new Error(`${SERVICE} is '${enabled}', expected 'enabled'`);
  }

  const aid = await tryRun(`sudo ${FALCONCTL} -g --aid`, { silent: true });
  if (/aid="[0-9a-f]+"/i.test(aid.stdout)) {
    throw new Error("Sensor still has an agent ID; golden image prep did not clear it");
  }

  // The installer starts the sensor to obtain an AID and then clears it; stop it so the
  // snapshot does not carry a running, AID-less sensor from the build VM.
  await run(`sudo systemctl stop ${SERVICE}`, { silent: true });

  const info = await tryRun(`sudo ${FALCONCTL} -g --cid --tags --backend`, { silent: true });
  core.info(`falcon-sensor installed, enabled for boot, stopped, agent ID cleared. ${info.stdout.trim()}`);
}

async function main(): Promise<void> {
  try {
    const cid = core.getInput("cid", { required: true }).trim();
    const cloud = validateChoice("cloud", core.getInput("cloud", { required: true }).trim(), CLOUDS);
    const tags = core.getInput("tags").trim();
    const versionDecrement = core.getInput("sensor-version-decrement").trim() || "0";
    const updatePolicy = core.getInput("sensor-update-policy").trim();
    const backend = validateChoice("backend", core.getInput("backend").trim() || "auto", BACKENDS);
    const clientIdEnv = core.getInput("client-id-env").trim() || "FALCON_CLIENT_ID";
    const clientSecretEnv = core.getInput("client-secret-env").trim() || "FALCON_CLIENT_SECRET";
    const tokenEnv = core.getInput("provisioning-token-env").trim() || "FALCON_PROVISIONING_TOKEN";

    if (!/^[0-9A-F]{32}-[0-9A-F]{2}$/i.test(cid)) {
      throw new Error("cid must be a 32-hex CID followed by '-' and a 2-digit checksum");
    }
    if (!/^[0-5]$/.test(versionDecrement)) {
      throw new Error("sensor-version-decrement must be an integer between 0 and 5");
    }

    const env: Record<string, string> = {
      FALCON_CLIENT_ID: requireSecret(clientIdEnv, "Falcon API client ID"),
      FALCON_CLIENT_SECRET: requireSecret(clientSecretEnv, "Falcon API client secret"),
      FALCON_CLOUD: cloud,
      FALCON_SENSOR_CLOUD: cloud,
      FALCON_CID: cid,
      FALCON_BACKEND: backend,
      FALCON_SENSOR_VERSION_DECREMENT: versionDecrement,
      PREP_GOLDEN_IMAGE: "true",
    };
    if (tags) env.FALCON_TAGS = tags;
    if (updatePolicy) env.FALCON_SENSOR_UPDATE_POLICY_NAME = updatePolicy;
    const token = process.env[tokenEnv];
    if (token) {
      core.setSecret(token);
      env.FALCON_PROVISIONING_TOKEN = token;
    }

    core.info(`Installing CrowdStrike Falcon sensor (cloud=${cloud}, backend=${backend}, tags=${tags || "none"})`);
    await runInstaller(installerPath(), env);
    await verifyInstall();
  } catch (error: unknown) {
    core.setFailed(error instanceof Error ? error.message : String(error));
  }
}

main();
