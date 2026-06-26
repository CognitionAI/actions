import * as core from "@actions/core";
import { run } from "../../shared/drs";

async function main(): Promise<void> {
  try {
    const browsers = core.getInput("browsers") || "chromium";

    await run("npm install -g playwright");
    await run(`npx playwright install --with-deps ${browsers}`);

    core.info(`Installed Playwright with browsers: ${browsers}`);
  } catch (error: unknown) {
    core.setFailed(error instanceof Error ? error.message : String(error));
  }
}

main();
