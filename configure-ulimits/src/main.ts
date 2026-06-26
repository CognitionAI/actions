import * as core from "@actions/core";
import { writeFileWithSudo } from "../../shared/drs";

async function main(): Promise<void> {
  try {
    const nofile = core.getInput("nofile");
    const nproc = core.getInput("nproc");

    let content = "";
    if (nofile) {
      content += `* soft nofile ${nofile}\n* hard nofile ${nofile}\n`;
    }
    if (nproc) {
      content += `* soft nproc ${nproc}\n* hard nproc ${nproc}\n`;
    }

    if (content) {
      await writeFileWithSudo("/etc/security/limits.d/99-devin.conf", content);
      core.info(`Configured ulimits: ${nofile ? `nofile=${nofile}` : ""} ${nproc ? `nproc=${nproc}` : ""}`.trim());
    } else {
      core.warning("No ulimits specified");
    }
  } catch (error: unknown) {
    core.setFailed(error instanceof Error ? error.message : String(error));
  }
}

main();
