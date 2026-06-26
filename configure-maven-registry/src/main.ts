import * as core from "@actions/core";
import { writeFile } from "../../shared/drs";
import * as path from "path";

async function main(): Promise<void> {
  try {
    const serverId = core.getInput("server-id", { required: true });
    const repoUrl = core.getInput("repo-url", { required: true });
    const username = core.getInput("username");
    const password = core.getInput("password");

    const m2Dir = path.join(process.env.HOME || "/home/ubuntu", ".m2");
    let settings = `<?xml version="1.0" encoding="UTF-8"?>
<settings>
  <servers>
    <server>
      <id>${serverId}</id>
${username ? `      <username>${username}</username>\n` : ""}${password ? `      <password>${password}</password>\n` : ""}    </server>
  </servers>
  <mirrors>
    <mirror>
      <id>${serverId}</id>
      <mirrorOf>*</mirrorOf>
      <url>${repoUrl}</url>
    </mirror>
  </mirrors>
</settings>`;

    await writeFile(path.join(m2Dir, "settings.xml"), settings);
    core.info(`Configured Maven server '${serverId}' → ${repoUrl}`);
  } catch (error: unknown) {
    core.setFailed(error instanceof Error ? error.message : String(error));
  }
}

main();
