# Cognition Actions

Reusable actions for giving Devin sessions short-lived access to services through OpenID Connect (OIDC), without storing long-lived credentials in Devin.

These actions are intended for the `initialize` section of a Devin environment blueprint.

## Available actions

| Action | Description |
| --- | --- |
| [`setup-devin-oidc`](./setup-devin-oidc/README.md) | Install the base `devin-oidc` CLI for OIDC token exchange |
| [`setup-aws-oidc`](./setup-aws-oidc/README.md) | Configure AWS CLI and SDK authentication with Devin OIDC |
| [`setup-vault-oidc`](./setup-vault-oidc/README.md) | Configure HashiCorp Vault CLI authentication with Devin OIDC |
| [`setup-jfrog-oidc`](./setup-jfrog-oidc/README.md) | Configure JFrog CLI authentication with Devin OIDC |

## `setup-devin-oidc`

Installs the `devin-oidc` command-line tool. Use this action when a Devin session needs an OIDC token for a service that trusts Devin as an identity provider.

```yaml
initialize:
  - uses: github.com/CognitionAI/actions/setup-devin-oidc@main
```

After initialization, request a token for your service:

```bash
devin-oidc token --audience my-api
```

To include additional Devin identity claims in the token subject, pass their names as a space-delimited list:

```bash
devin-oidc token \
  --audience my-api \
  --subject-keys "org_id repository_name"
```

Your service must be configured to trust Devin as an OIDC identity provider and accept the requested audience.

See the [`setup-devin-oidc` action documentation](./setup-devin-oidc/README.md) for command options and configuration details.
