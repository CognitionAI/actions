import * as core from "@actions/core";
import { exportVariable, writeFile } from "../../shared/drs";

async function main(): Promise<void> {
  try {
    const goproxy = core.getInput("goproxy", { required: true });
    const gonosumcheck = core.getInput("gonosumcheck");
    const goprivate = core.getInput("goprivate");
    const netrcContent = core.getInput("netrc-content");

    exportVariable("GOPROXY", goproxy);
    if (gonosumcheck) exportVariable("GONOSUMCHECK", gonosumcheck);
    if (goprivate) exportVariable("GOPRIVATE", goprivate);

    if (netrcContent) {
      await writeFile(`${process.env.HOME}/.netrc`, netrcContent);
      const fs = await import("fs");
      fs.chmodSync(`${process.env.HOME}/.netrc`, 0o600);
    }

    core.info(`Configured GOPROXY=${goproxy}`);
  } catch (error: unknown) {
    core.setFailed(error instanceof Error ? error.message : String(error));
  }
}

main();
