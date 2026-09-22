# Set up vendor-neutral XDR collection

Installs the OpenTelemetry Collector Contrib distribution and configures platform-native security logs and host signals for OTLP/HTTP delivery to a centralized SIEM. Use it in an enterprise or organization blueprint `initialize` section so the agent is part of every Devin VM image.

```yaml
initialize:
  - uses: github.com/CognitionAI/actions/setup-devin-oidc@main
  - uses: github.com/CognitionAI/actions/setup-otel-xdr@main
    with:
      endpoint: https://otlp-gateway.example.com
      oidc-audience: https://otlp-gateway.example.com
      resource-attributes: "deployment.environment.name=devin,security.zone=engineering"
```

## Signal profile

| Platform | Native security logs | Host signals |
|----------|----------------------|--------------|
| Linux | systemd journal plus bounded auditd events for process and network activity and changes to identity, privilege, and remote-access configuration | CPU, disk, filesystem, memory, network, paging, process, and process-count metrics |
| Windows | Security, System, Application, PowerShell Operational, and Task Scheduler events | CPU, disk, filesystem, memory, network, paging, process, and process-count metrics |
| macOS | Unified logs, including sudo activity when native auditing is enabled | CPU, disk, filesystem, memory, network, paging, process, and process-count metrics |

The collector starts after the cloned VM has network access. The image-build VM never connects to the SIEM, and each clone creates a unique `host.id` plus a fresh persistent export queue on first boot.

Raw process arguments are dropped before export because they commonly contain credentials. The action intentionally does not collect workspace files, terminal output, application logs, or file contents.

macOS process/exec events are excluded because Apple requires a Full Disk Access grant that a blueprint action cannot add.

## Inputs

| Input | Required | Default | Description |
|-------|----------|---------|-------------|
| `endpoint` | yes | — | HTTPS OTLP/HTTP base URL |
| `headers-env` | no | `OTEL_EXPORTER_OTLP_HEADERS` | Environment variable with secret comma-separated `key=value` exporter headers |
| `headers` | no | empty | Non-secret comma-separated exporter headers |
| `oidc-audience` | no | empty | Audience for per-session Devin OIDC authentication |
| `oidc-subject-keys` | no | `org_id` | Claims composing the exchanged OIDC token subject |
| `resource-attributes` | no | empty | Comma-separated OpenTelemetry resource attributes |
| `collector-version` | no | `0.160.0` | Pinned collector-contrib version |
| `collect-host-metrics` | no | `true` | Include host and per-process metrics |
| `collect-native-audit` | no | `true` | Enable the native security-audit profile |

With `oidc-audience`, the collector exchanges the session's Devin identity token every 30 seconds and the gateway validates the audience, issuer, expiry, signature, and org claim. No reusable SIEM credential is stored in the VM image. The gateway must stamp authoritative tenant and session fields from the JWT instead of trusting resource attributes.

As a compatibility fallback, secret headers can be supplied through `headers-env`. They are needed when cloned VMs run, so unlike installer credentials they must not be build-only. They are embedded root-only in the image, but Devin sessions have passwordless sudo. Treat them as exposed to each session: use a dedicated write-only ingestion credential, scope it to this org/tenant, and enforce rate limits at the OTLP gateway.

The receiving SIEM is the trust boundary. It must authenticate the credential's assigned tenant instead of trusting resource attributes, impose request and per-tenant volume limits, reject unexpected signal types, and retain the unmodified credential identity alongside the logs.

`0.160.0` is only a default pin; set a version your security team has validated. The action downloads the matching release artifact from `open-telemetry/opentelemetry-collector-releases`.
