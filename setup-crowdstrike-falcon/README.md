# `setup-crowdstrike-falcon`

Installs the CrowdStrike Falcon sensor into the Devin VM image so your security team gets the same EDR/XDR telemetry (processes, files, network) from every Devin session as from the rest of your fleet.

The action runs CrowdStrike's official [`falcon-linux-install.sh`](https://github.com/CrowdStrike/falcon-scripts/tree/main/bash/install) (vendored and pinned in this repo, see `vendor/`) with `PREP_GOLDEN_IMAGE=true`: the installer installs the sensor, starts it once on the build VM to obtain an agent ID, then clears that agent ID. The action then makes sure the service is enabled for boot and stops it, so the snapshot contains a configured, unregistered sensor. Every session VM booted from the snapshot registers as its own Falcon host.

## Usage

```yaml
initialize:
  - uses: github.com/CognitionAI/actions/setup-crowdstrike-falcon@main
    with:
      cid: "ABCDEF0123456789ABCDEF0123456789-12"
      cloud: us-2
      tags: "Devin,NonProd"
      sensor-version-decrement: "1"   # install N-1
```

### Secrets

Create two org secrets and mark them **Build only** so they are scrubbed from the snapshot and never visible inside a session:

| Secret | Contents |
| --- | --- |
| `FALCON_CLIENT_ID` | Falcon API client ID |
| `FALCON_CLIENT_SECRET` | Falcon API client secret |

The API client needs the `Sensor Download: Read` scope (plus `Sensor Update Policies: Read` if you use `sensor-update-policy`, and `Installation Tokens: Read` if your CID requires provisioning tokens). If your secrets have different names, point `client-id-env` / `client-secret-env` at them. Secret values are passed to the installer through the child process environment only (`sudo --preserve-env`), never on a command line or in the build log.

## Inputs

| Input | Required | Default | Description |
| --- | --- | --- | --- |
| `cid` | Yes | — | Customer ID with checksum (`<32 hex>-<2 digits>`) |
| `cloud` | Yes | — | `us-1`, `us-2`, `eu-1`, `us-gov-1`, `us-gov-2` |
| `tags` | No | — | Comma-separated sensor grouping tags |
| `sensor-version-decrement` | No | `0` | Install N minus this many releases (0-5) |
| `sensor-update-policy` | No | — | Install the version pinned by this Falcon sensor update policy (overrides `sensor-version-decrement`) |
| `backend` | No | `auto` | `auto`, `bpf` or `kernel` |
| `client-id-env` | No | `FALCON_CLIENT_ID` | Env var / org secret holding the API client ID |
| `client-secret-env` | No | `FALCON_CLIENT_SECRET` | Env var / org secret holding the API client secret |
| `provisioning-token-env` | No | `FALCON_PROVISIONING_TOKEN` | Env var / org secret holding an installation token (used only if set) |

## What the action verifies

- `/opt/CrowdStrike/falconctl` is installed
- `falcon-sensor.service` exists and is `enabled` (enabled explicitly if the package did not)
- the agent ID has been cleared (golden image prep succeeded)

The sensor is stopped before the snapshot is taken. Note that the build VM itself briefly registers with Falcon while the installer obtains the agent ID; that host entry goes idle once the build finishes.

## Notes

- **Platform.** Linux Devin VMs only; the action fails fast on any other platform.
- **Backend.** Devin VMs cannot load kernel modules, so the sensor runs in User Mode (eBPF). Devin's kernel ships the required BPF options; the Falcon console shows the host in User Mode with RFM = No (full telemetry).
- **Egress.** Allow `*.crowdstrike.com` (or your cloud's specific sensor and API hosts) in the tenant egress policy. Domain-based egress that does not terminate TLS works without further changes.
- **Host inventory.** Each session VM is a new Falcon host that goes idle when the session ends. Configure a host retention / auto-decommission policy in Falcon for the tags you set here.
- **Non-prod vs prod.** Use separate blueprints (or separate `cid` values) per CID; nothing customer-specific is baked into the action.
- **Pinning.** For an EDR agent, reference a tagged release of this repo rather than `@main`.
