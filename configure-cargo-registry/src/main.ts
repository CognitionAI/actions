import * as core from "@actions/core";
import { writeFile } from "../../shared/drs";
import * as path from "path";
import * as fs from "fs";

async function main(): Promise<void> {
  try {
    const registryName = core.getInput("registry-name", { required: true });
    const indexUrl = core.getInput("index-url", { required: true });
    const token = core.getInput("token");
    const replaceCratesIo = core.getInput("replace-crates-io") === "true";

    const cargoDir = path.join(process.env.HOME || "/home/ubuntu", ".cargo");
    const configPath = path.join(cargoDir, "config.toml");

    let content = "";
    if (fs.existsSync(configPath)) {
      content = fs.readFileSync(configPath, "utf8") + "\n";
    }

    content += `[registries.${registryName}]\nindex = "${indexUrl}"\n`;

    if (replaceCratesIo) {
      content += `\n[source.crates-io]\nreplace-with = "${registryName}"\n`;
      content += `\n[source.${registryName}]\nregistry = "${indexUrl}"\n`;
    }

    await writeFile(configPath, content);

    if (token) {
      const credPath = path.join(cargoDir, "credentials.toml");
      let creds = "";
      if (fs.existsSync(credPath)) {
        creds = fs.readFileSync(credPath, "utf8") + "\n";
      }
      creds += `[registries.${registryName}]\ntoken = "${token}"\n`;
      await writeFile(credPath, creds);
      fs.chmodSync(credPath, 0o600);
    }

    core.info(`Configured Cargo registry '${registryName}' → ${indexUrl}`);
  } catch (error: unknown) {
    core.setFailed(error instanceof Error ? error.message : String(error));
  }
}

main();
