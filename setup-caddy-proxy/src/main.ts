import * as core from "@actions/core";
import { run, writeFileWithSudo } from "../../shared/drs";

async function main(): Promise<void> {
  try {
    const hostnames = core.getInput("hostnames", { required: true });
    const installNss = core.getInput("install-nss-tools") !== "false";

    await run(
      "sudo apt-get update -qq && " +
      "sudo DEBIAN_FRONTEND=noninteractive apt-get install -y -qq debian-keyring debian-archive-keyring apt-transport-https curl && " +
      "curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg && " +
      "curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list && " +
      "sudo apt-get update -qq && " +
      "sudo DEBIAN_FRONTEND=noninteractive apt-get install -y -qq caddy"
    );

    if (installNss) {
      await run("sudo DEBIAN_FRONTEND=noninteractive apt-get install -y -qq libnss3-tools");
    }

    const mappings = hostnames.split(",").map(m => m.trim());
    let hostsEntries = "";
    let caddyConfig = "";

    for (const mapping of mappings) {
      const [hostname, port] = mapping.split(":");
      if (!hostname || !port) {
        core.warning(`Skipping invalid mapping: ${mapping} (expected hostname:port)`);
        continue;
      }
      hostsEntries += `127.0.0.1 ${hostname}\n`;
      caddyConfig += `${hostname} {\n  reverse_proxy localhost:${port}\n}\n\n`;
    }

    if (hostsEntries) {
      await run(`echo "${hostsEntries}" | sudo tee -a /etc/hosts > /dev/null`);
    }

    await writeFileWithSudo("/etc/caddy/Caddyfile", caddyConfig);
    await run("sudo systemctl restart caddy");

    if (installNss) {
      await run(
        'caddy trust 2>/dev/null || true; ' +
        'for certdb in $(find ~ -name "cert9.db" 2>/dev/null); do ' +
        '  certdir=$(dirname "$certdb"); ' +
        '  certutil -A -d "sql:$certdir" -t "C,," -n "Caddy Local" -i /var/lib/caddy/.local/share/caddy/pki/authorities/local/root.crt 2>/dev/null || true; ' +
        'done'
      );
    }

    core.info(`Configured Caddy reverse proxy: ${mappings.join(", ")}`);
  } catch (error: unknown) {
    core.setFailed(error instanceof Error ? error.message : String(error));
  }
}

main();
