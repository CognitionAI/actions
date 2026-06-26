import * as core from "@actions/core";
import { run } from "../../shared/drs";

async function main(): Promise<void> {
  try {
    const keyB64 = core.getInput("gpg-private-key-b64", { required: true });
    let keyId = core.getInput("key-id");
    const gitEmail = core.getInput("git-user-email");

    await run(`echo "${keyB64}" | base64 -d | gpg --batch --import`);

    if (!keyId) {
      keyId = await run("gpg --list-secret-keys --keyid-format LONG | grep sec | head -1 | awk '{print $2}' | cut -d'/' -f2", { silent: true });
    }

    await run(`git config --global user.signingkey ${keyId}`);
    await run("git config --global commit.gpgsign true");
    await run("git config --global gpg.program gpg");

    if (gitEmail) {
      await run(`git config --global user.email "${gitEmail}"`);
    }

    core.info(`Configured GPG signing with key ${keyId}`);
  } catch (error: unknown) {
    core.setFailed(error instanceof Error ? error.message : String(error));
  }
}

main();
