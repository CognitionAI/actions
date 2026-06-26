import * as core from "@actions/core";
import { run, exportVariable } from "../../shared/drs";
import * as fs from "fs";

async function main(): Promise<void> {
  try {
    const defaultVersion = core.getInput("default-version") || "20";
    const home = process.env.HOME || "/home/ubuntu";
    const nvmDir = `${home}/.nvm`;

    exportVariable("NVM_DIR", nvmDir);

    await run(
      `export NVM_DIR="${nvmDir}" && [ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh" && ` +
      `nvm install ${defaultVersion} && nvm alias default ${defaultVersion}`
    );

    const autoSwitchScript = `
cdnvm() {
  command cd "$@" || return $?
  nvm_path=$(nvm_find_up .nvmrc | tr -d '\\n')
  if [[ ! $nvm_path = *[^[:space:]]* ]]; then
    declare default_version
    default_version=$(nvm version default)
    if [[ $default_version == "N/A" ]]; then
      nvm alias default node
      default_version=$(nvm version default)
    fi
    if [[ $(nvm current) != "$default_version" ]]; then
      nvm use default
    fi
  elif [[ -s $nvm_path/.nvmrc && -r $nvm_path/.nvmrc ]]; then
    declare nvm_version
    nvm_version=$(<"$nvm_path/.nvmrc")
    declare locally_resolved_nvm_version
    locally_resolved_nvm_version=$(nvm ls --no-colors "$nvm_version" | tail -1 | tr -d '\\->*' | tr -d '[:space:]')
    if [[ "$locally_resolved_nvm_version" == "N/A" ]]; then
      nvm install "$nvm_version"
    elif [[ $(nvm current) != "$locally_resolved_nvm_version" ]]; then
      nvm use "$nvm_version"
    fi
  fi
}
alias cd='cdnvm'
cdnvm "$PWD" || exit
`;

    fs.appendFileSync(`${home}/.bashrc`, autoSwitchScript);
    core.info(`Configured nvm auto-switching (default: ${defaultVersion})`);
  } catch (error: unknown) {
    core.setFailed(error instanceof Error ? error.message : String(error));
  }
}

main();
