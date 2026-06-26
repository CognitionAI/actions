import * as core from "@actions/core";
import { writeFile } from "../../shared/drs";
import * as path from "path";

async function main(): Promise<void> {
  try {
    const repoUrl = core.getInput("repo-url", { required: true });
    const username = core.getInput("username");
    const password = core.getInput("password");

    const initDir = path.join(process.env.HOME || "/home/ubuntu", ".gradle", "init.d");
    const credBlock = username && password
      ? `\n            credentials {\n                username = "${username}"\n                password = "${password}"\n            }`
      : "";

    const script = `allprojects {
    repositories {
        maven {
            url "${repoUrl}"
            allowInsecureProtocol = ${repoUrl.startsWith("http://") ? "true" : "false"}${credBlock}
        }
    }
}`;

    await writeFile(path.join(initDir, "corp-mirror.gradle"), script);
    core.info(`Configured Gradle repository → ${repoUrl}`);
  } catch (error: unknown) {
    core.setFailed(error instanceof Error ? error.message : String(error));
  }
}

main();
