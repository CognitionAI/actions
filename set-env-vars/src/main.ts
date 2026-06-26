import * as core from "@actions/core";
import { exportVariable, writeFileWithSudo } from "../../shared/drs";

async function main(): Promise<void> {
  try {
    const envVars = core.getInput("env-vars", { required: true });
    const lines = envVars.split("\n").filter(l => l.trim() && l.includes("="));

    let profileContent = "";
    for (const line of lines) {
      const eqIdx = line.indexOf("=");
      const key = line.substring(0, eqIdx).trim();
      const value = line.substring(eqIdx + 1).trim();

      exportVariable(key, value);
      profileContent += `export ${key}="${value}"\n`;
    }

    if (profileContent) {
      await writeFileWithSudo("/etc/profile.d/drs-env.sh", profileContent);
    }

    core.info(`Set ${lines.length} environment variable(s)`);
  } catch (error: unknown) {
    core.setFailed(error instanceof Error ? error.message : String(error));
  }
}

main();
