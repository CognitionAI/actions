import * as core from "@actions/core";
import * as fs from "fs";
import * as path from "path";

async function main(): Promise<void> {
  try {
    const indexUrl = core.getInput("index-url", { required: true });
    const extraIndexUrl = core.getInput("extra-index-url");
    const trustedHost = core.getInput("trusted-host");

    const pipDir = path.join(process.env.HOME || "/home/ubuntu", ".config", "pip");
    fs.mkdirSync(pipDir, { recursive: true });

    let content = `[global]\nindex-url = ${indexUrl}\n`;
    if (extraIndexUrl) {
      content += `extra-index-url = ${extraIndexUrl}\n`;
    }
    if (trustedHost) {
      content += `trusted-host = ${trustedHost}\n`;
    }

    fs.writeFileSync(path.join(pipDir, "pip.conf"), content);
    core.info(`Configured pip index → ${indexUrl}`);
  } catch (error: unknown) {
    core.setFailed(error instanceof Error ? error.message : String(error));
  }
}

main();
