import * as core from "@actions/core";
import { run, commandExists } from "../../shared/drs";

async function main(): Promise<void> {
  try {
    const sourceUrl = core.getInput("source-url", { required: true });
    const username = core.getInput("username");
    const password = core.getInput("password");

    const hasBundler = await commandExists("bundle");
    if (!hasBundler) {
      await run("sudo apt-get update -qq && sudo DEBIAN_FRONTEND=noninteractive apt-get install -y -qq ruby-bundler || gem install bundler");
    }

    const host = new URL(sourceUrl).host;

    if (username && password) {
      await run(`bundle config set --global ${host} "${username}:${password}"`);
    }

    await run(`bundle config set --global mirror.https://rubygems.org ${sourceUrl}`);
    core.info(`Configured Bundler gem source → ${sourceUrl}`);
  } catch (error: unknown) {
    core.setFailed(error instanceof Error ? error.message : String(error));
  }
}

main();
