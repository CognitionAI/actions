import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";

// The built action, as a snapshot build runs it, against stand-ins for the
// tools its Linux scripts call.
const DIST = resolve(__dirname, "..", "dist", "index.js");

const STUBS: Record<string, string> = {
  // Answers once the packages are "installed", or always when the image came with a driver.
  "nvidia-smi": '[ -e "$STUB_DIR/installed" ] || [ "${STUB_PREINSTALLED:-0}" = 1 ] || exit 9\necho "Test GPU, 580.178.04, 00000000:01:00.0"',
  sudo: 'while [ "${1#-}" != "$1" ]; do shift; done\nexec "$@"',
  "apt-get": 'echo "apt-get $*" >> "$STUB_DIR/log"\n[ "$1" = install ] && [ "${STUB_DRIVER_ANSWERS:-1}" = 1 ] && touch "$STUB_DIR/installed"\nexit 0',
  modinfo: 'exit "${STUB_MODINFO_EXIT:-0}"',
  "dpkg-query": 'printf "ii  linux-image-6.8.0-100-generic\\nii  linux-headers-6.8.0-100-generic\\nii  bash\\nrc  linux-image-5.15.0-1\\n"',
  "apt-mark": 'echo "apt-mark $*" >> "$STUB_DIR/log"',
  uname: "echo 6.8.0-100-generic",
  sleep: "exit 0",
};

function runAction(inputs: Record<string, string>, stubEnv: Record<string, string> = {}) {
  const dir = mkdtempSync(join(tmpdir(), "setup-nvidia-driver-"));
  for (const [name, body] of Object.entries(STUBS)) {
    writeFileSync(join(dir, name), `#!/bin/bash\n${body}\n`);
    chmodSync(join(dir, name), 0o755);
  }
  const result = spawnSync(process.execPath, [DIST], {
    env: { PATH: `${dir}:/usr/bin:/bin`, STUB_DIR: dir, ...stubEnv, ...inputs },
    encoding: "utf8",
  });
  const log = existsSync(join(dir, "log")) ? readFileSync(join(dir, "log"), "utf8").trim().split("\n") : [];
  return { status: result.status, stdout: result.stdout, log };
}

const linuxOnly = { skip: process.platform !== "linux" };

test("installs the pinned packages for the running kernel, holds the kernel, then sees the driver", linuxOnly, () => {
  const { status, stdout, log } = runAction({});
  assert.equal(status, 0, stdout);
  assert.deepEqual(log, [
    "apt-get update",
    "apt-get install -y -o Dpkg::Options::=--force-confold linux-headers-6.8.0-100-generic dkms" +
      " nvidia-driver-580-server nvidia-utils-580-server xserver-xorg-core mesa-utils",
    "apt-mark hold linux-image-6.8.0-100-generic linux-headers-6.8.0-100-generic",
  ]);
  assert.match(stdout, /NVIDIA driver bound: Test GPU/);
});

test("installs nothing when the driver already answers", linuxOnly, () => {
  const { status, stdout, log } = runAction({}, { STUB_PREINSTALLED: "1" });
  assert.equal(status, 0, stdout);
  assert.deepEqual(log, []);
  assert.match(stdout, /already bound/);
});

test("an unsupported version fails before anything runs", linuxOnly, () => {
  const { status, stdout, log } = runAction({ INPUT_VERSION: "596.86" });
  assert.equal(status, 1);
  assert.deepEqual(log, []);
  assert.match(stdout, /::error::Unsupported NVIDIA driver version '596\.86' for Linux/);
});

test("fails when the module was not built for the running kernel", linuxOnly, () => {
  const { status, stdout, log } = runAction({}, { STUB_MODINFO_EXIT: "1" });
  assert.equal(status, 1);
  assert.equal(log.length, 2);
  assert.match(stdout, /::error::install\.sh exited with code 1/);
});

test("fails when nvidia-smi never answers within the timeout", linuxOnly, () => {
  const { status, stdout } = runAction({ "INPUT_TIMEOUT-SECONDS": "1" }, { STUB_DRIVER_ANSWERS: "0" });
  assert.equal(status, 1);
  assert.match(stdout, /did not answer within 1s/);
  assert.match(stdout, /::error::wait\.sh exited with code 1/);
});
