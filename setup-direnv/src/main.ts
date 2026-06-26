import * as core from "@actions/core";
import { run, addPath } from "../../shared/drs";
import * as fs from "fs";

async function main(): Promise<void> {
  try {
    const envrcContent = core.getInput("envrc-content");

    await run("sudo apt-get update -qq && sudo DEBIAN_FRONTEND=noninteractive apt-get install -y -qq direnv");
    await run('echo \'eval "$(direnv hook bash)"\' >> ~/.bashrc');

    if (envrcContent) {
      const content = envrcContent.split("\\n").join("\n");
      const workspace = process.env.GITHUB_WORKSPACE || process.cwd();
      fs.writeFileSync(`${workspace}/.envrc`, content + "\n");
      await run(`cd "${workspace}" && direnv allow`);
      core.info("Created and allowed .envrc");
    }

    core.info("Installed direnv");
  } catch (error: unknown) {
    core.setFailed(error instanceof Error ? error.message : String(error));
  }
}

main();
