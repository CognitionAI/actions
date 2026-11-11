import * as core from "@actions/core";
import * as exec from "@actions/exec";
import * as path from "path";
import { Interpreter, resolvePlan } from "./plan";

// dist/index.js and src/main.ts both sit one level below the action's root.
const SCRIPTS_DIR = path.resolve(__dirname, "..", "scripts");

/** The command line that runs *script*. Blueprint actions start from Git Bash on Windows, so PowerShell is started by its fixed system path. */
function commandLine(interpreter: Interpreter, script: string): [string, string[]] {
  if (interpreter === "bash") {
    return ["bash", [script]];
  }
  const powershell = path.win32.join(
    process.env.SystemRoot || "C:\\Windows",
    "System32",
    "WindowsPowerShell",
    "v1.0",
    "powershell.exe",
  );
  return [powershell, ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", script]];
}

async function main(): Promise<void> {
  try {
    const steps = resolvePlan(process.platform, core.getInput("version"), core.getInput("timeout-seconds"));
    for (const step of steps) {
      core.info(`setup-nvidia-driver: ${step.name}`);
      const [command, args] = commandLine(step.interpreter, path.join(SCRIPTS_DIR, step.script));
      const exitCode = await exec.exec(command, args, {
        env: { ...process.env, ...step.env } as Record<string, string>,
        ignoreReturnCode: true,
      });
      if (exitCode !== 0) {
        throw new Error(`${step.script} exited with code ${exitCode}`);
      }
    }
  } catch (error: unknown) {
    core.setFailed(error instanceof Error ? error.message : String(error));
  }
}

main();
