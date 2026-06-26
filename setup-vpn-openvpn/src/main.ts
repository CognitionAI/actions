import * as core from "@actions/core";
import { run } from "../../shared/drs";

async function main(): Promise<void> {
  try {
    const configB64 = core.getInput("config-b64", { required: true });
    const authUser = core.getInput("auth-user");
    const authPass = core.getInput("auth-pass");
    const waitSeconds = core.getInput("wait-seconds") || "10";

    await run("sudo apt-get update -qq && sudo DEBIAN_FRONTEND=noninteractive apt-get install -y -qq openvpn");

    await run(`echo "${configB64}" | base64 -d | sudo tee /etc/openvpn/client/devin.conf > /dev/null`);

    if (authUser && authPass) {
      await run(`printf '%s\\n%s\\n' "${authUser}" "${authPass}" | sudo tee /etc/openvpn/client/auth.txt > /dev/null`);
      await run("sudo chmod 600 /etc/openvpn/client/auth.txt");
      await run(`sudo sed -i 's|^auth-user-pass.*|auth-user-pass /etc/openvpn/client/auth.txt|' /etc/openvpn/client/devin.conf`);
    }

    await run("sudo systemctl daemon-reload && sudo systemctl enable --now openvpn-client@devin");
    await run(`sleep ${waitSeconds}`);

    const ip = await run("ip addr show tun0 2>/dev/null | grep 'inet ' | awk '{print $2}'", { silent: true });
    if (ip) {
      core.info(`VPN connected: ${ip}`);
    } else {
      core.warning("VPN may not be connected (no tun0 interface found)");
    }
  } catch (error: unknown) {
    core.setFailed(error instanceof Error ? error.message : String(error));
  }
}

main();
