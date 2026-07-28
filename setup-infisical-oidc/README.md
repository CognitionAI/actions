# `setup-infisical-oidc`

Configures the Infisical CLI to authenticate through Infisical's [OIDC Auth](https://infisical.com/docs/documentation/platform/identities/oidc-auth/general) machine identity method using short-lived Devin OIDC tokens. The action installs `devin-oidc`, optionally installs the Infisical CLI, and places an `infisical` wrapper that transparently obtains and refreshes access tokens.

All `infisical` subcommands (`infisical secrets`, `infisical run`, `infisical export`, etc.) authenticate automatically. The wrapper exchanges a Devin OIDC token for an Infisical access token at `/api/v1/auth/oidc-auth/login` and caches it for an hour.

## Usage

```yaml
initialize:
  - uses: github.com/CognitionAI/actions/setup-infisical-oidc@main
    with:
      identity-id: "<machine-identity-id>"
```

For self-hosted Infisical, set `infisical-url`:

```yaml
initialize:
  - uses: github.com/CognitionAI/actions/setup-infisical-oidc@main
    with:
      infisical-url: "https://infisical.example.com"
      identity-id: "<machine-identity-id>"
```

Infisical CLI commands then authenticate automatically:

```bash
infisical secrets --projectId <project-id> --env dev
infisical run --projectId <project-id> --env dev -- npm start
```

The standalone refresh helper is also available for tools that need a raw access token:

```bash
TOKEN=$(devin-oidc-infisical-refresh)
curl -H "Authorization: Bearer $TOKEN" https://app.infisical.com/api/v3/secrets/raw/...
```

## Inputs

| Input | Required | Default | Description |
| --- | --- | --- | --- |
| `infisical-url` | No | `https://app.infisical.com` | Infisical instance URL |
| `identity-id` | Yes | — | Machine identity ID configured with OIDC Auth |
| `audience` | No | `infisical-url` | OIDC audience; must match the OIDC Auth configuration's audiences |
| `subject-keys` | No | `org_id` | Space-delimited Devin claims used to form the token subject |
| `install-infisical-cli` | No | `true` | Whether to install the Infisical CLI if it is absent |
| `infisical-cli-version` | No | `0.43.110` | Infisical CLI version to install |

## Infisical prerequisites

An Infisical organization administrator must:

1. Create a [machine identity](https://infisical.com/docs/documentation/platform/identities/machine-identities) (Organization Settings → Access Control → Identities) with an appropriate organization role.

2. Configure the identity's authentication method as **OIDC Auth** with:
   - **OIDC Discovery URL**: Your Devin OIDC issuer URL
   - **Issuer**: Your Devin OIDC issuer URL
   - **Audiences**: Must match the `audience` input (defaults to `infisical-url`)
   - **Subject**: Must match the subject produced by this action. With the default `org_id` subject keys, the subject is `org_id:<your-org-id>`.

3. Add the identity to each project it needs access to (Project Settings → Access Control → Machine Identities) with an appropriate project role.

For your Devin OIDC issuer URL and organization ID, refer to your Devin administrator or Cognition support.
