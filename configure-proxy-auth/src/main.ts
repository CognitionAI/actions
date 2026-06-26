import * as core from "@actions/core";
import { exportVariable, writeFileWithSudo } from "../../shared/drs";

async function main(): Promise<void> {
  try {
    const proxyHost = core.getInput("proxy-host", { required: true });
    const username = core.getInput("proxy-username", { required: true });
    const password = core.getInput("proxy-password", { required: true });
    const scheme = core.getInput("proxy-scheme") || "http";
    const noProxy = core.getInput("no-proxy") || "localhost,127.0.0.1";

    const encodedUser = encodeURIComponent(username);
    const encodedPass = encodeURIComponent(password);
    const proxyUrl = `${scheme}://${encodedUser}:${encodedPass}@${proxyHost}`;

    exportVariable("http_proxy", proxyUrl);
    exportVariable("https_proxy", proxyUrl);
    exportVariable("HTTP_PROXY", proxyUrl);
    exportVariable("HTTPS_PROXY", proxyUrl);
    exportVariable("no_proxy", noProxy);
    exportVariable("NO_PROXY", noProxy);

    await writeFileWithSudo(
      "/etc/profile.d/proxy.sh",
      `export http_proxy="${proxyUrl}"\n` +
      `export https_proxy="${proxyUrl}"\n` +
      `export HTTP_PROXY="${proxyUrl}"\n` +
      `export HTTPS_PROXY="${proxyUrl}"\n` +
      `export no_proxy="${noProxy}"\n` +
      `export NO_PROXY="${noProxy}"\n`
    );

    core.info(`Configured authenticated proxy: ${scheme}://${proxyHost}`);
  } catch (error: unknown) {
    core.setFailed(error instanceof Error ? error.message : String(error));
  }
}

main();
