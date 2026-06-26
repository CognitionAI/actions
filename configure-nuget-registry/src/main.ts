import * as core from "@actions/core";
import { writeFile } from "../../shared/drs";
import * as path from "path";

async function main(): Promise<void> {
  try {
    const sourceName = core.getInput("source-name", { required: true });
    const sourceUrl = core.getInput("source-url", { required: true });
    const username = core.getInput("username");
    const password = core.getInput("password");
    const configPath = core.getInput("config-path") ||
      path.join(process.env.HOME || "/home/ubuntu", ".nuget", "NuGet", "NuGet.Config");

    let credentialsSection = "";
    if (username && password) {
      credentialsSection = `
  <packageSourceCredentials>
    <${sourceName}>
      <add key="Username" value="${username}" />
      <add key="ClearTextPassword" value="${password}" />
    </${sourceName}>
  </packageSourceCredentials>`;
    }

    const config = `<?xml version="1.0" encoding="utf-8"?>
<configuration>
  <packageSources>
    <add key="${sourceName}" value="${sourceUrl}" />
  </packageSources>${credentialsSection}
</configuration>`;

    await writeFile(configPath, config);
    core.info(`Configured NuGet source '${sourceName}' → ${sourceUrl}`);
  } catch (error: unknown) {
    core.setFailed(error instanceof Error ? error.message : String(error));
  }
}

main();
