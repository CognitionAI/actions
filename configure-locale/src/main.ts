import * as core from "@actions/core";
import { run, exportVariable } from "../../shared/drs";

async function main(): Promise<void> {
  try {
    const locale = core.getInput("locale") || "en_US.UTF-8";
    const timezone = core.getInput("timezone");

    await run("sudo apt-get update -qq && sudo DEBIAN_FRONTEND=noninteractive apt-get install -y -qq locales");
    await run(`sudo locale-gen ${locale}`);
    await run(`sudo update-locale LANG=${locale}`);
    exportVariable("LANG", locale);
    exportVariable("LC_ALL", locale);
    core.info(`Set locale to ${locale}`);

    if (timezone) {
      await run(`sudo ln -snf /usr/share/zoneinfo/${timezone} /etc/localtime`);
      await run(`echo "${timezone}" | sudo tee /etc/timezone > /dev/null`);
      await run("sudo dpkg-reconfigure -f noninteractive tzdata");
      exportVariable("TZ", timezone);
      core.info(`Set timezone to ${timezone}`);
    }
  } catch (error: unknown) {
    core.setFailed(error instanceof Error ? error.message : String(error));
  }
}

main();
