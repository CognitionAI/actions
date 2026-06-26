import * as core from "@actions/core";
import { run, exportVariable } from "../../shared/drs";

async function main(): Promise<void> {
  try {
    const registryUrl = core.getInput("registry-url", { required: true });
    const username = core.getInput("username", { required: true });
    const password = core.getInput("password", { required: true });
    const configureBuildkit = core.getInput("configure-buildkit") !== "false";

    await run(`echo "${password}" | docker login "${registryUrl}" -u "${username}" --password-stdin`);

    if (configureBuildkit) {
      exportVariable("DOCKER_BUILDKIT", "1");
    }

    core.info(`Authenticated Docker with ${registryUrl}`);
  } catch (error: unknown) {
    core.setFailed(error instanceof Error ? error.message : String(error));
  }
}

main();
