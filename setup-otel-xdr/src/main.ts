import * as core from "@actions/core";
import * as exec from "@actions/exec";
import { chmodSync, existsSync, mkdirSync, rmSync, writeFileSync } from "fs";
import { resolve } from "path";
import { installDevinOidcCli } from "../../shared/devin-oidc-cli";

const COLLECTOR = "otelcol-contrib";
const PLATFORMS: Record<NodeJS.Platform, string> = {
  aix: "",
  android: "",
  darwin: "macos",
  freebsd: "",
  haiku: "",
  linux: "linux",
  openbsd: "",
  sunos: "",
  win32: "windows",
  cygwin: "",
  netbsd: "",
};

interface PlatformConfig {
  configDir: string;
  configPath: string;
  installer: string;
  logPath: string;
  oidcAudiencePath: string;
  oidcSubjectKeysPath: string;
  oidcTokenPath: string;
  stateDir: string;
}

function parsePairs(value: string, name: string): Record<string, string> {
  const pairs: Record<string, string> = {};
  for (const entry of value.split(",").map((part) => part.trim()).filter(Boolean)) {
    const separator = entry.indexOf("=");
    if (separator <= 0) {
      throw new Error(`${name} entries must use key=value`);
    }
    const key = entry.slice(0, separator).trim();
    const pairValue = entry.slice(separator + 1).trim();
    if (!/^[A-Za-z0-9_.-]+$/.test(key)) {
      throw new Error(`${name} key '${key}' is invalid`);
    }
    if (!pairValue || /[\r\n\0]/.test(pairValue)) {
      throw new Error(`${name} value for '${key}' is empty or invalid`);
    }
    pairs[key] = pairValue;
  }
  return pairs;
}

function enabledInput(name: string): boolean {
  const value = core.getInput(name).trim().toLowerCase();
  if (value !== "true" && value !== "false") {
    throw new Error(`${name} must be 'true' or 'false'`);
  }
  return value === "true";
}

function configuration(platform: string): PlatformConfig {
  if (platform === "linux") {
    return {
      configDir: "/etc/devin-xdr",
      configPath: "/etc/devin-xdr/config.json",
      installer: "configure-linux.sh",
      logPath: "/var/log/devin-xdr/collector.log",
      oidcAudiencePath: "/etc/devin-xdr/oidc-audience",
      oidcSubjectKeysPath: "/etc/devin-xdr/oidc-subject-keys",
      oidcTokenPath: "/run/devin-xdr/oidc-token",
      stateDir: "/var/lib/devin-xdr",
    };
  }
  if (platform === "windows") {
    return {
      configDir: "C:\\ProgramData\\DevinXdr",
      configPath: "C:\\ProgramData\\DevinXdr\\config.json",
      installer: "configure-windows.ps1",
      logPath: "C:\\ProgramData\\DevinXdr\\collector.log",
      oidcAudiencePath: "C:\\ProgramData\\DevinXdr\\oidc-audience",
      oidcSubjectKeysPath: "C:\\ProgramData\\DevinXdr\\oidc-subject-keys",
      oidcTokenPath: "C:\\ProgramData\\DevinXdr\\state\\oidc-token",
      stateDir: "C:\\ProgramData\\DevinXdr\\state",
    };
  }
  return {
    configDir: "/Library/Application Support/DevinXdr",
    configPath: "/Library/Application Support/DevinXdr/config.json",
    installer: "configure-macos.sh",
    logPath: "/Library/Logs/DevinXdr/collector.log",
    oidcAudiencePath: "/Library/Application Support/DevinXdr/oidc-audience",
    oidcSubjectKeysPath: "/Library/Application Support/DevinXdr/oidc-subject-keys",
    oidcTokenPath: "/Library/Application Support/DevinXdr/state/oidc-token",
    stateDir: "/Library/Application Support/DevinXdr/state",
  };
}

function fileReceivers(platform: string): Record<string, object> {
  if (platform === "linux") {
    return {
      journald: { start_at: "end" },
      "filelog/audit": {
        include: ["/var/log/audit/audit.log"],
        start_at: "end",
        storage: "file_storage",
        retry_on_failure: { enabled: true },
      },
    };
  }
  if (platform === "windows") {
    return {
      "windowseventlog/security": { channel: "security", start_at: "end", storage: "file_storage" },
      "windowseventlog/system": { channel: "system", start_at: "end", storage: "file_storage" },
      "windowseventlog/application": { channel: "application", start_at: "end", storage: "file_storage" },
      "windowseventlog/powershell": {
        channel: "Microsoft-Windows-PowerShell/Operational",
        start_at: "end",
        storage: "file_storage",
      },
      "windowseventlog/tasks": {
        channel: "Microsoft-Windows-TaskScheduler/Operational",
        start_at: "end",
        storage: "file_storage",
      },
    };
  }
  return {
    "filelog/unified": {
      include: ["/Library/Logs/DevinXdr/unified.ndjson"],
      operators: [{ parse_from: "body", type: "json_parser" }],
      start_at: "end",
      storage: "file_storage",
      retry_on_failure: { enabled: true },
    },
  };
}

function collectorConfig(inputs: {
  platform: string;
  endpoint: string;
  headers: Record<string, string>;
  oidcAudience: string;
  resourceAttributes: Record<string, string>;
  collectHostMetrics: boolean;
}): object {
  const platformConfig = configuration(inputs.platform);
  const receivers: Record<string, object> = fileReceivers(inputs.platform);
  const logReceivers = Object.keys(receivers);
  if (inputs.collectHostMetrics) {
    receivers.hostmetrics = {
      collection_interval: "60s",
      scrapers: {
        cpu: {},
        disk: {},
        filesystem: {},
        load: {},
        memory: {},
        network: {},
        paging: {},
        process: { mute_process_user_error: true },
        processes: {},
      },
    };
  }

  const attributes = Object.entries({
    "service.name": "devin-vm",
    "service.namespace": "devin-xdr",
    "devin.remote.id": "${env:DEVIN_XDR_REMOTE_ID}",
    "devin.session.id": "${env:DEVIN_XDR_SESSION_ID}",
    "host.boot.id": "${env:DEVIN_XDR_BOOT_ID}",
    "host.id": "${env:DEVIN_XDR_HOST_ID}",
    "os.type": inputs.platform,
    ...inputs.resourceAttributes,
  }).map(([key, value]) => ({ action: "upsert", key, value }));

  const pipelines: Record<string, object> = {
    logs: {
      receivers: logReceivers,
      processors: ["memory_limiter", "resourcedetection/system", "filter/sensitive-argv", "resource", "batch"],
      exporters: ["otlphttp/siem"],
    },
  };
  if (inputs.collectHostMetrics) {
    pipelines.metrics = {
      receivers: ["hostmetrics"],
      processors: ["memory_limiter", "resourcedetection/system", "resource", "batch"],
      exporters: ["otlphttp/siem"],
    };
  }

  const extensions: Record<string, object> = {
    file_storage: { directory: platformConfig.stateDir },
    health_check: { endpoint: "127.0.0.1:13133" },
  };
  const exporter: Record<string, unknown> = {
    compression: "gzip",
    endpoint: inputs.endpoint,
    headers: inputs.headers,
    retry_on_failure: { enabled: true, max_elapsed_time: "0s" },
    sending_queue: {
      enabled: true,
      num_consumers: 4,
      queue_size: 2048,
      storage: "file_storage",
    },
    timeout: "30s",
  };
  if (inputs.oidcAudience) {
    extensions["bearertokenauth/oidc"] = {
      filename: platformConfig.oidcTokenPath,
      retry_on_failure: { enabled: true, interval: "2s", max_retries: 0 },
      wait_for_token_file: true,
    };
    exporter.auth = { authenticator: "bearertokenauth/oidc" };
  }

  return {
    extensions,
    receivers,
    processors: {
      batch: {},
      "filter/sensitive-argv": {
        error_mode: "ignore",
        logs: {
          log_record: [
            "IsMatch(body, \"^type=(EXECVE|PROCTITLE)\")",
          ],
        },
      },
      memory_limiter: {
        check_interval: "1s",
        limit_mib: 256,
        spike_limit_mib: 64,
      },
      resource: { attributes },
      "resourcedetection/system": {
        detectors: ["system"],
        override: false,
        timeout: "2s",
      },
    },
    exporters: {
      "otlphttp/siem": exporter,
    },
    service: {
      extensions: Object.keys(extensions),
      pipelines,
      telemetry: {
        logs: {
          error_output_paths: [platformConfig.logPath],
          level: "info",
          output_paths: [platformConfig.logPath],
        },
      },
    },
  };
}

function scriptPath(name: string): string {
  const actionRoot = process.env.GITHUB_ACTION_PATH || resolve(__dirname, "..");
  const path = resolve(actionRoot, "vendor", name);
  if (!existsSync(path)) {
    throw new Error(`Platform installer not found at ${path}`);
  }
  return path;
}

async function runInstaller(platform: string, installer: string, env: Record<string, string>): Promise<void> {
  const tool = platform === "windows" ? "powershell.exe" : "/bin/bash";
  const args = platform === "windows"
    ? ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", installer]
    : [installer];
  const exitCode = await exec.exec(tool, args, {
    env: { ...process.env, ...env } as Record<string, string>,
    ignoreReturnCode: true,
    silent: true,
    listeners: {
      stdout: (data) => process.stdout.write(data),
      stderr: (data) => process.stderr.write(data),
    },
  });
  if (exitCode !== 0) {
    throw new Error(`XDR collector setup failed with exit code ${exitCode}`);
  }
}

async function main(): Promise<void> {
  const temporaryFiles: string[] = [];
  try {
    const platform = PLATFORMS[process.platform];
    if (!platform) {
      throw new Error(`setup-otel-xdr does not support '${process.platform}'`);
    }
    const endpoint = core.getInput("endpoint", { required: true }).trim().replace(/\/+$/, "");
    if (!URL.canParse(endpoint) || new URL(endpoint).protocol !== "https:") {
      throw new Error("endpoint must be an HTTPS OTLP/HTTP base URL");
    }
    const endpointUrl = new URL(endpoint);
    if (endpointUrl.username || endpointUrl.password || endpointUrl.search || endpointUrl.hash) {
      throw new Error("endpoint must not contain credentials, query parameters, or a fragment");
    }
    const collectorVersion = core.getInput("collector-version").trim();
    if (!/^\d+\.\d+\.\d+$/.test(collectorVersion)) {
      throw new Error("collector-version must be a pinned semantic version");
    }
    const architecture = process.arch === "x64" ? "amd64" : process.arch;
    if (architecture !== "amd64" && architecture !== "arm64") {
      throw new Error(`setup-otel-xdr does not support '${process.arch}'`);
    }

    const headers = parsePairs(core.getInput("headers"), "headers");
    const headersEnv = core.getInput("headers-env").trim() || "OTEL_EXPORTER_OTLP_HEADERS";
    if (process.env[headersEnv]) {
      core.setSecret(process.env[headersEnv]!);
      Object.assign(headers, parsePairs(process.env[headersEnv]!, "secret headers"));
      Object.values(headers).forEach((value) => core.setSecret(value));
    }
    const oidcAudience = core.getInput("oidc-audience").trim();
    if (/[\r\n\0]/.test(oidcAudience)) {
      throw new Error("oidc-audience is invalid");
    }
    const oidcSubjectKeys = core.getInput("oidc-subject-keys").trim() || "org_id";
    if (!/^[A-Za-z0-9_ -]+$/.test(oidcSubjectKeys)) {
      throw new Error("oidc-subject-keys is invalid");
    }
    if (oidcAudience && Object.keys(headers).some((key) => key.toLowerCase() === "authorization")) {
      throw new Error("Do not configure an Authorization header with oidc-audience");
    }
    if (oidcAudience && platform !== "windows") {
      await installDevinOidcCli();
    }
    const resourceAttributes = parsePairs(core.getInput("resource-attributes"), "resource-attributes");
    for (const key of Object.keys(resourceAttributes)) {
      if (key.startsWith("devin.") || key === "host.id" || key === "host.boot.id" || key === "os.type") {
        throw new Error(`resource-attributes cannot override reserved identity attribute '${key}'`);
      }
    }
    const platformConfig = configuration(platform);
    const temporaryDirectory = process.env.RUNNER_TEMP || process.cwd();
    mkdirSync(temporaryDirectory, { recursive: true });
    const temporaryConfig = resolve(temporaryDirectory, `devin-xdr-${process.pid}.json`);
    temporaryFiles.push(temporaryConfig);
    writeFileSync(
      temporaryConfig,
      `${JSON.stringify(collectorConfig({
        platform,
        endpoint,
        headers,
        oidcAudience,
        resourceAttributes,
        collectHostMetrics: enabledInput("collect-host-metrics"),
      }), null, 2)}\n`,
      { mode: 0o600 },
    );
    chmodSync(temporaryConfig, 0o600);

    let temporaryOidcAudience = "";
    let temporaryOidcSubjectKeys = "";
    if (oidcAudience) {
      temporaryOidcAudience = resolve(temporaryDirectory, `devin-xdr-audience-${process.pid}`);
      temporaryOidcSubjectKeys = resolve(temporaryDirectory, `devin-xdr-subject-${process.pid}`);
      temporaryFiles.push(temporaryOidcAudience, temporaryOidcSubjectKeys);
      writeFileSync(temporaryOidcAudience, `${oidcAudience}\n`, { mode: 0o600 });
      writeFileSync(temporaryOidcSubjectKeys, `${oidcSubjectKeys}\n`, { mode: 0o600 });
    }

    core.info(`Installing ${COLLECTOR} ${collectorVersion} for ${platform}/${architecture}`);
    await runInstaller(platform, scriptPath(platformConfig.installer), {
      DEVIN_XDR_ARCH: architecture,
      DEVIN_XDR_COLLECT_NATIVE_AUDIT: enabledInput("collect-native-audit").toString(),
      DEVIN_XDR_COLLECTOR_VERSION: collectorVersion,
      DEVIN_XDR_CONFIG_DIR: platformConfig.configDir,
      DEVIN_XDR_CONFIG_PATH: platformConfig.configPath,
      DEVIN_XDR_INSTALL_DIR: platformConfig.configDir,
      DEVIN_XDR_LOG_PATH: platformConfig.logPath,
      DEVIN_XDR_OIDC_TOKEN_PATH: platformConfig.oidcTokenPath,
      DEVIN_XDR_STATE_DIR: platformConfig.stateDir,
      DEVIN_XDR_TEMP_CONFIG: temporaryConfig,
      DEVIN_XDR_TEMP_OIDC_AUDIENCE: temporaryOidcAudience,
      DEVIN_XDR_TEMP_OIDC_SUBJECT_KEYS: temporaryOidcSubjectKeys,
    });
    core.info("Vendor-neutral XDR collection is installed and enabled for cloned VM startup");
  } catch (error: unknown) {
    core.setFailed(error instanceof Error ? error.message : String(error));
  } finally {
    for (const temporaryFile of temporaryFiles) {
      rmSync(temporaryFile, { force: true });
    }
  }
}

main();
