import * as core from "@actions/core";
import { run } from "../../shared/drs";
import * as fs from "fs";

async function main(): Promise<void> {
  try {
    const scope = core.getInput("scope", { required: true });
    const registryUrl = core.getInput("registry-url", { required: true });
    const authToken = core.getInput("auth-token");

    const npmrc = `${process.env.HOME}/.npmrc`;
    const registryHost = new URL(registryUrl).host;

    let content = "";
    if (fs.existsSync(npmrc)) {
      content = fs.readFileSync(npmrc, "utf8");
    }

    content += `${scope}:registry=${registryUrl}\n`;
    if (authToken) {
      content += `//${registryHost}/:_authToken=${authToken}\n`;
    }

    fs.writeFileSync(npmrc, content);
    core.info(`Configured npm scope ${scope} → ${registryUrl}`);
  } catch (error: unknown) {
    core.setFailed(error instanceof Error ? error.message : String(error));
  }
}

main();
