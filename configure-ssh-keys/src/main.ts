import * as core from "@actions/core";
import * as fs from "fs";
import * as path from "path";

async function main(): Promise<void> {
  try {
    const keyB64 = core.getInput("private-key-b64", { required: true });
    const knownHosts = core.getInput("known-hosts");
    const sshConfig = core.getInput("ssh-config");
    const keyFilename = core.getInput("key-filename") || "id_rsa";
    const extraKeyB64 = core.getInput("extra-key-b64");

    const sshDir = path.join(process.env.HOME || "/home/ubuntu", ".ssh");
    fs.mkdirSync(sshDir, { recursive: true });
    fs.chmodSync(sshDir, 0o700);

    const keyData = Buffer.from(keyB64, "base64").toString("utf8");
    const keyPath = path.join(sshDir, keyFilename);
    fs.writeFileSync(keyPath, keyData);
    fs.chmodSync(keyPath, 0o600);
    core.info(`Installed SSH key: ${keyFilename}`);

    if (extraKeyB64) {
      const extraData = Buffer.from(extraKeyB64, "base64").toString("utf8");
      const extraPath = path.join(sshDir, `${keyFilename}-extra`);
      fs.writeFileSync(extraPath, extraData);
      fs.chmodSync(extraPath, 0o600);
      core.info(`Installed extra SSH key: ${keyFilename}-extra`);
    }

    if (knownHosts) {
      const khPath = path.join(sshDir, "known_hosts");
      let existing = "";
      if (fs.existsSync(khPath)) existing = fs.readFileSync(khPath, "utf8");
      fs.writeFileSync(khPath, existing + knownHosts + "\n");
      fs.chmodSync(khPath, 0o644);
    }

    if (sshConfig) {
      const configPath = path.join(sshDir, "config");
      let existing = "";
      if (fs.existsSync(configPath)) existing = fs.readFileSync(configPath, "utf8") + "\n";
      fs.writeFileSync(configPath, existing + sshConfig + "\n");
      fs.chmodSync(configPath, 0o600);
    }
  } catch (error: unknown) {
    core.setFailed(error instanceof Error ? error.message : String(error));
  }
}

main();
