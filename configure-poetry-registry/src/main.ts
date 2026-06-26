import * as core from "@actions/core";
import { run, commandExists } from "../../shared/drs";

async function main(): Promise<void> {
  try {
    const repoName = core.getInput("repo-name", { required: true });
    const repoUrl = core.getInput("repo-url", { required: true });
    const username = core.getInput("username");
    const password = core.getInput("password");
    const setDefault = core.getInput("set-as-default") === "true";

    const hasPoetry = await commandExists("poetry");
    if (!hasPoetry) {
      await run("pip install poetry || pip3 install poetry");
    }

    await run(`poetry config repositories.${repoName} ${repoUrl}`);

    if (setDefault) {
      await run(`poetry source add ${repoName} ${repoUrl} --priority=default 2>/dev/null || true`);
    }

    if (username && password) {
      await run(`poetry config http-basic.${repoName} "${username}" "${password}"`);
    }

    core.info(`Configured Poetry repository '${repoName}' → ${repoUrl}${setDefault ? " (default)" : ""}`);
  } catch (error: unknown) {
    core.setFailed(error instanceof Error ? error.message : String(error));
  }
}

main();
