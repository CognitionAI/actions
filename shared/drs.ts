/**
 * Shared helpers for DRS GitHub Actions.
 *
 * Provides utilities for:
 * - Running shell commands with proper error handling
 * - Propagating environment variables via ENVRC (Devin-specific) and GITHUB_ENV
 * - Propagating PATH changes via GITHUB_PATH and ENVRC
 * - Writing config files with sudo support
 */

import * as core from "@actions/core";
import * as exec from "@actions/exec";
import * as fs from "fs";
import * as path from "path";

/**
 * Run a shell command via bash. Throws on non-zero exit code.
 */
export async function run(
  command: string,
  options?: { silent?: boolean; cwd?: string },
): Promise<string> {
  let stdout = "";
  const exitCode = await exec.exec("bash", ["-c", command], {
    silent: options?.silent ?? false,
    cwd: options?.cwd,
    listeners: {
      stdout: (data: Buffer) => {
        stdout += data.toString();
      },
    },
  });
  if (exitCode !== 0) {
    throw new Error(`Command failed with exit code ${exitCode}: ${command}`);
  }
  return stdout.trim();
}

/**
 * Run a shell command, returning exit code without throwing.
 */
export async function tryRun(
  command: string,
  options?: { silent?: boolean },
): Promise<{ exitCode: number; stdout: string }> {
  let stdout = "";
  const exitCode = await exec.exec("bash", ["-c", command], {
    silent: options?.silent ?? true,
    ignoreReturnCode: true,
    listeners: {
      stdout: (data: Buffer) => {
        stdout += data.toString();
      },
    },
  });
  return { exitCode, stdout: stdout.trim() };
}

/**
 * Append a directory to PATH via GITHUB_PATH, and also write it to ENVRC
 * so the Devin session inherits it.
 */
export function addPath(dir: string): void {
  core.addPath(dir);
  appendToEnvrc(`PATH=${dir}:$PATH`);
}

/**
 * Export an environment variable via GITHUB_ENV, and also write it to ENVRC.
 */
export function exportVariable(name: string, value: string): void {
  core.exportVariable(name, value);
  appendToEnvrc(`${name}=${value}`);
}

/**
 * Write a line to the ENVRC file (Devin-specific mechanism for persisting
 * environment across steps and into the session).
 */
export function appendToEnvrc(line: string): void {
  const envrc = process.env.ENVRC;
  if (envrc) {
    try {
      fs.appendFileSync(envrc, line + "\n");
    } catch {
      core.debug(`Could not write to ENVRC at ${envrc}`);
    }
  }
}

/**
 * Write content to a file using sudo (for system config files).
 */
export async function writeFileWithSudo(
  filePath: string,
  content: string,
): Promise<void> {
  await run(`sudo mkdir -p "${path.dirname(filePath)}"`);
  // printf '%s' passes the content through verbatim (unlike echo, which can
  // mangle backslashes); single quotes are escaped for the shell.
  const escaped = content.replace(/'/g, "'\\''");
  await run(`printf '%s' '${escaped}' | sudo tee "${filePath}" > /dev/null`);
}

/**
 * Write content to a file in the user's home directory.
 */
export async function writeFile(
  filePath: string,
  content: string,
): Promise<void> {
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(filePath, content);
}

/**
 * Get the system architecture string as used by dpkg (amd64, arm64, etc.)
 */
export async function getArch(): Promise<string> {
  return run("dpkg --print-architecture", { silent: true });
}

/**
 * Check if a command is available on PATH.
 */
export async function commandExists(cmd: string): Promise<boolean> {
  const { exitCode } = await tryRun(`command -v ${cmd}`);
  return exitCode === 0;
}

/**
 * Create a profile.d script for system-wide env vars.
 */
export async function writeProfileScript(
  name: string,
  content: string,
): Promise<void> {
  await writeFileWithSudo(`/etc/profile.d/${name}.sh`, content);
}
