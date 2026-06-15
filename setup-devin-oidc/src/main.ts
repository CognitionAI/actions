import * as core from "@actions/core";
import { DEVIN_OIDC_CLI_PATH, installDevinOidcCli } from "../../shared/devin-oidc-cli";

async function main(): Promise<void> {
  try {
    await installDevinOidcCli();
    core.info(`Installed devin-oidc CLI at ${DEVIN_OIDC_CLI_PATH}`);
  } catch (error: unknown) {
    core.setFailed(error instanceof Error ? error.message : String(error));
  }
}

main();
