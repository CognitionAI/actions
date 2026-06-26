import * as core from "@actions/core";
import { run, exportVariable, writeFileWithSudo, commandExists } from "../../shared/drs";

async function main(): Promise<void> {
  try {
    const httpProxy = core.getInput("http-proxy", { required: true });
    const httpsProxy = core.getInput("https-proxy", { required: true });
    const noProxy = core.getInput("no-proxy") || "localhost,127.0.0.1";
    const configureGit = core.getInput("configure-git") !== "false";
    const configureNpm = core.getInput("configure-npm") === "true";

    exportVariable("http_proxy", httpProxy);
    exportVariable("https_proxy", httpsProxy);
    exportVariable("HTTP_PROXY", httpProxy);
    exportVariable("HTTPS_PROXY", httpsProxy);
    exportVariable("no_proxy", noProxy);
    exportVariable("NO_PROXY", noProxy);

    await writeFileWithSudo(
      "/etc/profile.d/proxy.sh",
      `export http_proxy="${httpProxy}"\n` +
      `export https_proxy="${httpsProxy}"\n` +
      `export HTTP_PROXY="${httpProxy}"\n` +
      `export HTTPS_PROXY="${httpsProxy}"\n` +
      `export no_proxy="${noProxy}"\n` +
      `export NO_PROXY="${noProxy}"\n`
    );

    if (configureGit) {
      await run(`git config --global http.proxy "${httpProxy}"`);
      await run(`git config --global https.proxy "${httpsProxy}"`);
      core.info("Configured git proxy");
    }

    if (configureNpm) {
      const hasNpm = await commandExists("npm");
      if (hasNpm) {
        await run(`npm config set proxy "${httpProxy}"`);
        await run(`npm config set https-proxy "${httpsProxy}"`);
        core.info("Configured npm proxy");
      } else {
        core.warning("npm not found, skipping npm proxy configuration");
      }
    }

    core.info(`Configured proxy: ${httpProxy}`);
  } catch (error: unknown) {
    core.setFailed(error instanceof Error ? error.message : String(error));
  }
}

main();
