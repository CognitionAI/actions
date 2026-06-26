import * as core from "@actions/core";
import { writeFile } from "../../shared/drs";
import * as path from "path";
import * as fs from "fs";

async function main(): Promise<void> {
  try {
    const repoUrl = core.getInput("repo-url", { required: true });
    const repoName = core.getInput("repo-name") || "private";
    const repoType = core.getInput("repo-type") || "composer";
    const authToken = core.getInput("auth-token");

    const composerHome = path.join(process.env.HOME || "/home/ubuntu", ".config", "composer");
    fs.mkdirSync(composerHome, { recursive: true });

    const configPath = path.join(composerHome, "config.json");
    let config: Record<string, unknown> = {};
    if (fs.existsSync(configPath)) {
      config = JSON.parse(fs.readFileSync(configPath, "utf8"));
    }

    if (!config.repositories) config.repositories = {};
    (config.repositories as Record<string, unknown>)[repoName] = {
      type: repoType,
      url: repoUrl,
    };

    if (authToken) {
      const host = new URL(repoUrl).host;
      if (!config["http-basic"]) config["http-basic"] = {};
      (config["http-basic"] as Record<string, unknown>)[host] = {
        username: "token",
        password: authToken,
      };
    }

    await writeFile(configPath, JSON.stringify(config, null, 2));
    core.info(`Configured Composer repository '${repoName}' → ${repoUrl}`);
  } catch (error: unknown) {
    core.setFailed(error instanceof Error ? error.message : String(error));
  }
}

main();
