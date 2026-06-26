import * as core from "@actions/core";
import * as fs from "fs";

async function main(): Promise<void> {
  try {
    const registryUrl = core.getInput("registry-url", { required: true });
    const authToken = core.getInput("auth-token");
    const scope = core.getInput("scope");
    const yarnVersion = core.getInput("yarn-version") || "1";

    if (yarnVersion === "1") {
      const npmrc = `${process.env.HOME}/.npmrc`;
      const registryHost = new URL(registryUrl).host;

      let content = "";
      if (fs.existsSync(npmrc)) {
        content = fs.readFileSync(npmrc, "utf8");
      }

      if (scope) {
        content += `${scope}:registry=${registryUrl}\n`;
      } else {
        content += `registry=${registryUrl}\n`;
      }
      if (authToken) {
        content += `//${registryHost}/:_authToken=${authToken}\n`;
      }

      fs.writeFileSync(npmrc, content);
    } else {
      const yarnrc = `${process.env.HOME}/.yarnrc.yml`;
      let content = "";
      if (fs.existsSync(yarnrc)) {
        content = fs.readFileSync(yarnrc, "utf8") + "\n";
      }

      if (scope) {
        content += `npmScopes:\n  ${scope.replace("@", "")}:\n    npmRegistryServer: "${registryUrl}"\n`;
        if (authToken) {
          content += `    npmAuthToken: "${authToken}"\n`;
        }
      } else {
        content += `npmRegistryServer: "${registryUrl}"\n`;
        if (authToken) {
          content += `npmAuthToken: "${authToken}"\n`;
        }
      }

      fs.writeFileSync(yarnrc, content);
    }

    core.info(`Configured Yarn ${yarnVersion} registry → ${registryUrl}`);
  } catch (error: unknown) {
    core.setFailed(error instanceof Error ? error.message : String(error));
  }
}

main();
