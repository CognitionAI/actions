import * as core from "@actions/core";
import { run, exportVariable, writeFile } from "../../shared/drs";
import * as fs from "fs";
import * as path from "path";

async function main(): Promise<void> {
  try {
    const domain = core.getInput("domain", { required: true });
    const domainOwner = core.getInput("domain-owner", { required: true });
    const region = core.getInput("region", { required: true });
    const npmRepo = core.getInput("npm-repo");
    const pypiRepo = core.getInput("pypi-repo");
    const mavenRepo = core.getInput("maven-repo");

    const token = await run(
      `aws codeartifact get-authorization-token ` +
      `--domain "${domain}" --domain-owner "${domainOwner}" --region "${region}" ` +
      `--query authorizationToken --output text`,
      { silent: true }
    );

    exportVariable("CODEARTIFACT_AUTH_TOKEN", token);

    if (npmRepo) {
      const endpoint = await run(
        `aws codeartifact get-repository-endpoint ` +
        `--domain "${domain}" --domain-owner "${domainOwner}" --region "${region}" ` +
        `--repository "${npmRepo}" --format npm --query repositoryEndpoint --output text`,
        { silent: true }
      );
      const npmrc = `${process.env.HOME}/.npmrc`;
      const host = new URL(endpoint).host;
      let content = "";
      if (fs.existsSync(npmrc)) content = fs.readFileSync(npmrc, "utf8");
      content += `registry=${endpoint}\n//${host}/:_authToken=${token}\n`;
      fs.writeFileSync(npmrc, content);
      core.info(`Configured npm → CodeArtifact ${npmRepo}`);
    }

    if (pypiRepo) {
      const endpoint = await run(
        `aws codeartifact get-repository-endpoint ` +
        `--domain "${domain}" --domain-owner "${domainOwner}" --region "${region}" ` +
        `--repository "${pypiRepo}" --format pypi --query repositoryEndpoint --output text`,
        { silent: true }
      );
      const pipDir = path.join(process.env.HOME || "/home/ubuntu", ".config", "pip");
      fs.mkdirSync(pipDir, { recursive: true });
      const pipConf = `[global]\nindex-url = ${endpoint}simple/\n`;
      fs.writeFileSync(path.join(pipDir, "pip.conf"), pipConf);
      core.info(`Configured pip → CodeArtifact ${pypiRepo}`);
    }

    if (mavenRepo) {
      const endpoint = await run(
        `aws codeartifact get-repository-endpoint ` +
        `--domain "${domain}" --domain-owner "${domainOwner}" --region "${region}" ` +
        `--repository "${mavenRepo}" --format maven --query repositoryEndpoint --output text`,
        { silent: true }
      );
      const m2Dir = path.join(process.env.HOME || "/home/ubuntu", ".m2");
      const settings = `<?xml version="1.0" encoding="UTF-8"?>
<settings>
  <servers>
    <server>
      <id>codeartifact</id>
      <username>aws</username>
      <password>${token}</password>
    </server>
  </servers>
  <mirrors>
    <mirror>
      <id>codeartifact</id>
      <mirrorOf>*</mirrorOf>
      <url>${endpoint}</url>
    </mirror>
  </mirrors>
</settings>`;
      await writeFile(path.join(m2Dir, "settings.xml"), settings);
      core.info(`Configured Maven → CodeArtifact ${mavenRepo}`);
    }
  } catch (error: unknown) {
    core.setFailed(error instanceof Error ? error.message : String(error));
  }
}

main();
