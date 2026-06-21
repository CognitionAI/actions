# `setup-jfrog-oidc`

Configures the JFrog CLI to authenticate through JFrog's OIDC token exchange using short-lived Devin OIDC tokens. The action installs `devin-oidc`, optionally installs the JFrog CLI, and places a `jf` wrapper that transparently refreshes credentials when they expire.

All `jf` subcommands (`jf npm install`, `jf docker pull`, `jf pip install`, `jf rt dl`, etc.) authenticate automatically. On a 401 or 403 response, the wrapper re-exchanges a fresh Devin OIDC token for a new JFrog access token and retries the command.

## Usage

```yaml
initialize:
  - uses: github.com/CognitionAI/actions/setup-jfrog-oidc@main
    with:
      jfrog-url: "https://mycompany.jfrog.io"
      provider-name: "devin-oidc"
```

JFrog CLI commands then authenticate automatically:

```bash
jf npm install
jf rt ping
jf docker pull mycompany.jfrog.io/docker-local/myimage:latest
```

The standalone refresh helper is also available for tools that need a raw token:

```bash
TOKEN=$(devin-oidc-jfrog-refresh)
curl -H "Authorization: Bearer $TOKEN" https://mycompany.jfrog.io/artifactory/api/...
```

## Inputs

| Input | Required | Default | Description |
| --- | --- | --- | --- |
| `jfrog-url` | Yes | — | JFrog Platform URL |
| `provider-name` | Yes | — | OIDC provider name configured in JFrog Platform |
| `audience` | No | `jfrog-url` | OIDC audience; must match the JFrog OIDC integration's audience |
| `subject-keys` | No | `org_id` | Space-delimited Devin claims used to form the token subject |
| `server-id` | No | `default` | JFrog CLI server configuration ID |
| `install-jfrog-cli` | No | `true` | Whether to install the JFrog CLI if it is absent |
| `jfrog-cli-version` | No | `2.72.2` | JFrog CLI version to install |

## JFrog prerequisites

A JFrog Platform administrator must:

1. Create an OIDC integration (Admin → Platform Security → OpenID Connect) with:
   - **Provider Type**: Generic OpenID Connect
   - **Provider URL**: Your Devin OIDC issuer URL
   - **Audience**: Must match the `audience` input (defaults to `jfrog-url`)

2. Create an identity mapping for the integration that grants appropriate permissions. The mapping's claims must match the subject produced by this action. With the default `org_id`, the subject is `org_id:<your-org-id>`.

Example using the JFrog REST API:

```bash
# Create OIDC integration
curl -X POST "https://mycompany.jfrog.io/access/api/v1/oidc" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "devin-oidc",
    "issuer_url": "<your-devin-oidc-issuer>",
    "provider_type": "generic",
    "audience": "https://mycompany.jfrog.io"
  }'

# Create identity mapping
curl -X POST "https://mycompany.jfrog.io/access/api/v1/oidc/devin-oidc/identity_mappings" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "devin-sessions",
    "priority": 1,
    "claims": {"sub": "org_id:<your-org-id>"},
    "token_spec": {
      "scope": "applied-permissions/groups:devin-developers",
      "expires_in": 3600
    }
  }'
```

For your Devin OIDC issuer URL and organization ID, refer to your Devin administrator or Cognition support.
