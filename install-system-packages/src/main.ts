import * as core from "@actions/core";
import { run } from "../../shared/drs";

async function main(): Promise<void> {
  try {
    const packages = core.getInput("packages", { required: true });

    await run("sudo apt-get update -qq");
    await run(`sudo DEBIAN_FRONTEND=noninteractive apt-get install -y -qq ${packages}`);

    core.info(`Installed packages: ${packages}`);
  } catch (error: unknown) {
    core.setFailed(error instanceof Error ? error.message : String(error));
  }
}

main();
