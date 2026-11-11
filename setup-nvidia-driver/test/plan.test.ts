import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import test from "node:test";
import pins from "../pins.json";
import { resolvePlan } from "../src/plan";

const ACTION_ROOT = resolve(__dirname, "..");
const SCRIPTS_DIR = join(ACTION_ROOT, "scripts");

test("linux plan installs the pinned packages, then waits", () => {
  assert.deepEqual(resolvePlan("linux", "", ""), [
    {
      name: "install NVIDIA driver 580",
      interpreter: "bash",
      script: "install.sh",
      env: { NVIDIA_DRIVER_PACKAGES: "nvidia-driver-580-server nvidia-utils-580-server" },
    },
    {
      name: "wait for nvidia-smi",
      interpreter: "bash",
      script: "wait.sh",
      env: { NVIDIA_WAIT_TIMEOUT_SECONDS: "600" },
    },
  ]);
});

test("windows plan passes the pinned download and the 7zr fallback, then waits for that version", () => {
  const [install, wait] = resolvePlan("win32", "596.86", "900");
  assert.equal(install.interpreter, "powershell");
  assert.equal(install.script, "install.ps1");
  assert.deepEqual(install.env, {
    NVIDIA_DRIVER_VERSION: "596.86",
    NVIDIA_DRIVER_URL: pins.win32.versions["596.86"].url,
    NVIDIA_DRIVER_SHA256: pins.win32.versions["596.86"].sha256,
    SEVEN_ZIP_URL: pins["7zr"].url,
    SEVEN_ZIP_SHA256: pins["7zr"].sha256,
  });
  assert.equal(wait.script, "wait.ps1");
  assert.deepEqual(wait.env, { NVIDIA_DRIVER_VERSION: "596.86", NVIDIA_WAIT_TIMEOUT_SECONDS: "900" });
});

test("a version that is not pinned for the platform is rejected", () => {
  // What an unquoted `version: 596.80` would arrive as.
  assert.throws(() => resolvePlan("win32", "596.8", ""), /Unsupported.*'596\.8' for Windows\. Supported: 596\.86\./);
  // A Windows version on a Linux VM.
  assert.throws(() => resolvePlan("linux", "596.86", ""), /Unsupported.*for Linux\. Supported: 580\./);
});

test("a timeout that is not a positive whole number is rejected", () => {
  for (const timeout of ["0", "-5", "1.5", "ten"]) {
    assert.throws(() => resolvePlan("linux", "", timeout), /timeout-seconds/);
  }
});

test("a platform other than Linux and Windows is rejected", () => {
  assert.throws(() => resolvePlan("darwin", "", ""), /Linux and Windows/);
});

test("pins: defaults are pinned, downloads are https with a sha256", () => {
  assert.ok(pins.linux.default in pins.linux.versions);
  assert.ok(pins.win32.default in pins.win32.versions);
  for (const pin of Object.values(pins.linux.versions)) {
    assert.ok(pin.packages.length > 0);
  }
  for (const pin of [...Object.values(pins.win32.versions), pins["7zr"]]) {
    assert.match(pin.url, /^https:\/\//);
    assert.match(pin.sha256, /^[0-9a-f]{64}$/);
  }
});

test("each script reads exactly the variables its step passes", () => {
  for (const platform of ["linux", "win32"]) {
    for (const step of resolvePlan(platform, "", "")) {
      const script = readFileSync(join(SCRIPTS_DIR, step.script), "utf8");
      const read = new Set(script.match(/\b(NVIDIA|SEVEN_ZIP)_[A-Z0-9_]+\b/g));
      assert.deepEqual([...read].sort(), Object.keys(step.env).sort(), step.script);
    }
  }
});

test("scripts: bash parses the Linux ones, the PowerShell ones are ASCII", () => {
  for (const script of readdirSync(SCRIPTS_DIR)) {
    const path = join(SCRIPTS_DIR, script);
    if (script.endsWith(".sh")) {
      execFileSync("bash", ["-n", path]);
    } else {
      // Windows PowerShell 5.1 reads a file without a BOM in the ANSI code page.
      assert.match(readFileSync(path, "utf8"), /^[\x00-\x7F]*$/, script);
    }
  }
});

test("the action carries no installer or archive", () => {
  const files = readdirSync(ACTION_ROOT, { recursive: true }) as string[];
  const binaries = files.filter((file) => /\.(exe|msi|cab|zip|7z|tar|gz|tgz|run|deb)$/i.test(file));
  assert.deepEqual(binaries, []);
});
