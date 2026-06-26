import * as core from "@actions/core";
import { run } from "../../shared/drs";

async function main(): Promise<void> {
  try {
    const hostsEntries = core.getInput("hosts-entries");
    const nameservers = core.getInput("nameservers");
    const searchDomains = core.getInput("search-domains");

    if (hostsEntries) {
      const lines = hostsEntries.split("\\n").join("\n");
      await run(`echo "${lines}" | sudo tee -a /etc/hosts > /dev/null`);
      core.info("Added entries to /etc/hosts");
    }

    if (nameservers || searchDomains) {
      let resolv = "";
      if (searchDomains) {
        resolv += `search ${searchDomains}\n`;
      }
      if (nameservers) {
        for (const ns of nameservers.split(",")) {
          resolv += `nameserver ${ns.trim()}\n`;
        }
      }
      await run(`echo "${resolv}" | sudo tee /etc/resolv.conf > /dev/null`);
      core.info("Updated /etc/resolv.conf");
    }
  } catch (error: unknown) {
    core.setFailed(error instanceof Error ? error.message : String(error));
  }
}

main();
