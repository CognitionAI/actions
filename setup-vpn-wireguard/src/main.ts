import * as core from "@actions/core";
import { run } from "../../shared/drs";

async function main(): Promise<void> {
  try {
    const configB64 = core.getInput("config-b64", { required: true });

    await run("sudo apt-get update -qq && sudo DEBIAN_FRONTEND=noninteractive apt-get install -y -qq wireguard");
    await run(`echo "${configB64}" | base64 -d | sudo tee /etc/wireguard/wg0.conf > /dev/null`);
    await run("sudo chmod 600 /etc/wireguard/wg0.conf");
    await run("sudo wg-quick up wg0");

    const status = await run("sudo wg show wg0 | head -5", { silent: true });
    core.info(`WireGuard connected:\n${status}`);
  } catch (error: unknown) {
    core.setFailed(error instanceof Error ? error.message : String(error));
  }
}

main();
