import pins from "../pins.json";

export type Interpreter = "bash" | "powershell";

/** One script of the action, with the variables it reads. */
export interface Step {
  name: string;
  interpreter: Interpreter;
  script: string;
  env: Record<string, string>;
}

function resolveVersion(platformName: string, requested: string, fallback: string, supported: string[]): string {
  const version = requested.trim() || fallback;
  if (!supported.includes(version)) {
    // YAML reads an unquoted 596.80 as the number 596.8, so the value that arrives is not what was typed.
    throw new Error(
      `Unsupported NVIDIA driver version '${version}' for ${platformName}. Supported: ${supported.join(", ")}. ` +
        `Quote the value in the blueprint (version: "${fallback}").`,
    );
  }
  return version;
}

function resolveTimeout(requested: string): string {
  const timeout = requested.trim() || "600";
  if (!/^[1-9][0-9]*$/.test(timeout)) {
    throw new Error(`timeout-seconds must be a positive whole number of seconds, got '${timeout}'`);
  }
  return timeout;
}

/** The install and wait steps for *platform*. Throws on a platform, version or timeout the action does not support. */
export function resolvePlan(platform: string, version: string, timeoutSeconds: string): Step[] {
  if (platform !== "linux" && platform !== "win32") {
    throw new Error(`setup-nvidia-driver supports Linux and Windows Devin VMs (detected '${platform}')`);
  }
  const timeout = resolveTimeout(timeoutSeconds);

  if (platform === "linux") {
    const { versions, default: fallback } = pins.linux;
    const resolved = resolveVersion("Linux", version, fallback, Object.keys(versions));
    const pin = versions[resolved as keyof typeof versions];
    return [
      {
        name: `install NVIDIA driver ${resolved}`,
        interpreter: "bash",
        script: "install.sh",
        env: { NVIDIA_DRIVER_PACKAGES: pin.packages.join(" ") },
      },
      {
        name: "wait for nvidia-smi",
        interpreter: "bash",
        script: "wait.sh",
        env: { NVIDIA_WAIT_TIMEOUT_SECONDS: timeout },
      },
    ];
  }

  const { versions, default: fallback } = pins.win32;
  const resolved = resolveVersion("Windows", version, fallback, Object.keys(versions));
  const pin = versions[resolved as keyof typeof versions];
  return [
    {
      name: `install NVIDIA driver ${resolved}`,
      interpreter: "powershell",
      script: "install.ps1",
      env: {
        NVIDIA_DRIVER_VERSION: resolved,
        NVIDIA_DRIVER_URL: pin.url,
        NVIDIA_DRIVER_SHA256: pin.sha256,
        SEVEN_ZIP_URL: pins["7zr"].url,
        SEVEN_ZIP_SHA256: pins["7zr"].sha256,
      },
    },
    {
      name: "wait for nvidia-smi",
      interpreter: "powershell",
      script: "wait.ps1",
      env: { NVIDIA_DRIVER_VERSION: resolved, NVIDIA_WAIT_TIMEOUT_SECONDS: timeout },
    },
  ];
}
