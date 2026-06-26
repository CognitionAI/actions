import * as core from "@actions/core";
import * as fs from "fs";

async function main(): Promise<void> {
  try {
    const registryUrl = core.getInput("registry-url", { required: true });
    const authToken = core.getInput("auth-token");
    const strictSsl = core.getInput("strict-ssl");

    const npmrc = `${process.env.HOME}/.npmrc`;
    const registryHost = new URL(registryUrl).host;

    let content = `registry=${registryUrl}\n`;
    if (strictSsl === "false") {
      content += "strict-ssl=false\n";
    }
    if (authToken) {
      content += `//${registryHost}/:_authToken=${authToken}\n`;
    }

    fs.writeFileSync(npmrc, content);
    core.info(`Configured npm registry → ${registryUrl}`);
  } catch (error: unknown) {
    core.setFailed(error instanceof Error ? error.message : String(error));
  }
}

main();
