import * as core from "@actions/core";
import { run, exportVariable } from "../../shared/drs";

async function main(): Promise<void> {
  try {
    const certB64 = core.getInput("certificate-b64", { required: true });
    const certName = core.getInput("certificate-name") || "corp-root-ca.crt";
    const extraCertB64 = core.getInput("extra-certificate-b64");
    const extraCertName = core.getInput("extra-certificate-name") || "corp-intermediate-ca.crt";
    const configureNode = core.getInput("configure-node") !== "false";

    const certDir = "/usr/local/share/ca-certificates";

    await run(`echo "${certB64}" | base64 -d | sudo tee "${certDir}/${certName}" > /dev/null`);
    core.info(`Installed certificate: ${certName}`);

    const certFiles = [`${certDir}/${certName}`];

    if (extraCertB64) {
      await run(`echo "${extraCertB64}" | base64 -d | sudo tee "${certDir}/${extraCertName}" > /dev/null`);
      certFiles.push(`${certDir}/${extraCertName}`);
      core.info(`Installed certificate: ${extraCertName}`);
    }

    if (certFiles.length > 1) {
      const catCmd = certFiles.map(f => `"${f}"`).join(" ");
      await run(`cat ${catCmd} | sudo tee "${certDir}/corp-bundle.crt" > /dev/null`);
    }

    await run("sudo update-ca-certificates");

    if (configureNode) {
      const bundlePath = certFiles.length > 1
        ? `${certDir}/corp-bundle.crt`
        : `${certDir}/${certName}`;
      exportVariable("NODE_EXTRA_CA_CERTS", bundlePath);
      core.info(`Set NODE_EXTRA_CA_CERTS=${bundlePath}`);
    }
  } catch (error: unknown) {
    core.setFailed(error instanceof Error ? error.message : String(error));
  }
}

main();
