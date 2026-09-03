# `setup-azure-oidc`

Configures the Azure CLI and Azure SDKs to authenticate through Microsoft Entra workload identity federation using short-lived Devin OIDC tokens. The action installs `devin-oidc`, optionally installs the Azure CLI, and places an `az` wrapper that refreshes the federated token and re-logs in automatically as needed.

Azure SDKs use the exported workload identity environment variables and the federated token file. The refresh helper is also available for SDK-only workloads that need to ensure the token file is current.

## Usage

```yaml
initialize:
  - uses: github.com/CognitionAI/actions/setup-azure-oidc@main
    with:
      client-id: "<application-client-id>"
      tenant-id: "<entra-tenant-id>"
      subscription-id: "<azure-subscription-id>"
```

Azure CLI commands then authenticate automatically:

```bash
az account show
az group list
az vm list
```

For SDK-only workloads, refresh the federated token file before acquiring credentials when necessary:

```bash
devin-oidc-azure-refresh --token-only
```

The `az` wrapper re-logs in automatically roughly every 50 minutes.

## Inputs

| Input | Required | Default | Description |
| --- | --- | --- | --- |
| `client-id` | Yes | — | Application (client) ID of the Entra app registration or user-assigned managed identity |
| `tenant-id` | Yes | — | Entra tenant ID |
| `subscription-id` | No | `""` | Default Azure subscription to select |
| `audience` | No | `api://AzureADTokenExchange` | OIDC audience; must match the federated credential's audience |
| `subject-keys` | No | `org_id` | Space-delimited Devin claims used to form the token subject |
| `install-azure-cli` | No | `true` | Whether to install the Azure CLI if it is absent |

## Azure prerequisites

An Azure administrator must:

1. Create an [app registration](https://learn.microsoft.com/entra/identity-platform/quickstart-register-app) or a user-assigned managed identity.

2. Add a **Federated identity credential** to it using the **Other issuer** scenario:
   - **Issuer**: Your Devin OIDC issuer URL
   - **Subject**: `org_id:<your-org-id>` (with the default `subject-keys` input)
   - **Audience**: `api://AzureADTokenExchange`

3. Assign the required Azure RBAC roles to the service principal on the subscription or resource group it needs to access.

For your Devin OIDC issuer URL and organization ID, refer to your Devin administrator or Cognition support.

The federated token file is refreshed whenever `az` runs or `devin-oidc-azure-refresh` runs. SDK-only workloads should call `devin-oidc-azure-refresh --token-only` before acquiring tokens if the file is stale, because Devin OIDC tokens are short-lived. Azure CLI access tokens last about an hour, so the wrapper re-logs in roughly every 50 minutes.
