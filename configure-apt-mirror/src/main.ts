import * as core from "@actions/core";
import { run } from "../../shared/drs";

async function main(): Promise<void> {
  try {
    const mirrorUrl = core.getInput("mirror-url", { required: true });

    await run(
      `sudo sed -i "s|http://archive.ubuntu.com/ubuntu|${mirrorUrl}|g" /etc/apt/sources.list && ` +
      `sudo sed -i "s|http://security.ubuntu.com/ubuntu|${mirrorUrl}|g" /etc/apt/sources.list`
    );
    await run("sudo apt-get update -qq");

    core.info(`Configured apt mirror → ${mirrorUrl}`);
  } catch (error: unknown) {
    core.setFailed(error instanceof Error ? error.message : String(error));
  }
}

main();
