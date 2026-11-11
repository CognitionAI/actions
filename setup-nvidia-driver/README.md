# `setup-nvidia-driver`

Installs a pinned NVIDIA driver on a Devin VM that has an NVIDIA GPU, then waits until `nvidia-smi` answers. The snapshot is taken after the action returns, so sessions start with the driver already bound to the card.

Works on Linux and Windows VMs.

## Usage

```yaml
initialize:
  - uses: github.com/CognitionAI/actions/setup-nvidia-driver@main
    with:
      version: "596.86"   # Windows default; the Linux default is "580"
```

`version` can be left out; the action then installs the default for the VM's platform.

## Inputs

| Input | Required | Default | Description |
| --- | --- | --- | --- |
| `version` | No | `596.86` on Windows, `580` on Linux | Driver version. Must be one of the supported versions below for the VM's platform |
| `timeout-seconds` | No | `600` | How long to wait for `nvidia-smi` to answer after the install |

Quote `version`. YAML reads an unquoted `596.80` as the number `596.8`, so the action would receive a different version from the one you typed.

## Supported versions

| Platform | `version` | What is installed |
| --- | --- | --- |
| Windows | `596.86` | The GRID 20.2 build of the driver, downloaded from the URL in `pins.json` and checked against a pinned SHA256 |
| Linux (Ubuntu) | `580` | Ubuntu's `nvidia-driver-580-server` and `nvidia-utils-580-server` packages, at the point release apt currently serves |

Any other value fails the build immediately, before anything is downloaded, and the error lists the supported versions. The pins are in [`pins.json`](./pins.json); the repository holds URLs and checksums only, never an installer.

## What the action does

**Linux** ([`scripts/install.sh`](./scripts/install.sh), [`scripts/wait.sh`](./scripts/wait.sh))

1. Does nothing if `nvidia-smi` already answers.
2. Installs the driver packages with the running kernel's headers and `dkms`.
3. Fails if the `nvidia` module was not built for the running kernel.
4. Loads the module (`modprobe nvidia`), because installing the packages does not.
5. Puts the installed kernel packages on hold (`apt-mark hold`), because a kernel upgrade would boot a kernel the module was not built for.
6. Polls `nvidia-smi` every 5 seconds until it answers or `timeout-seconds` passes.

**Windows** ([`scripts/install.ps1`](./scripts/install.ps1), [`scripts/wait.ps1`](./scripts/wait.ps1))

1. Does nothing if `nvidia-smi` already reports the requested version for every card.
2. Downloads the installer and fails on a checksum mismatch.
3. Extracts it with 7-Zip. If the VM has no 7-Zip, the action downloads 7-Zip's standalone `7zr.exe` (also checked against a pinned SHA256).
4. Adds the driver to the driver store and installs it on the card with `pnputil`.
5. Polls `nvidia-smi` every 5 seconds until every card reports the requested version or `timeout-seconds` passes.

## Requirements

- The VM must have an NVIDIA GPU. Without one the build fails: on Linux when the module is loaded (`could not insert 'nvidia': No such device`), on Windows when the wait reaches `timeout-seconds`.
- Linux: Ubuntu, booted on a kernel whose `linux-headers-$(uname -r)` package is available from apt.
- Windows: outbound HTTPS to the installer's host in [`pins.json`](./pins.json), and to `github.com` and `release-assets.githubusercontent.com` when the VM has no 7-Zip.

## Notes

- A build that inherits `initialize` from an earlier snapshot does not run the action again, so that build does not wait for `nvidia-smi`. It starts from a snapshot that already has the driver bound.
- Adding a version is one entry in `pins.json`: the download URL and SHA256 on Windows, the apt package names on Linux.
