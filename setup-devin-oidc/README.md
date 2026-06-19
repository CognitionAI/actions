# `setup-devin-oidc`

Installs the `devin-oidc` command-line tool, which exchanges a Devin session's general OIDC token for short-lived audience-scoped tokens using RFC 8693 token exchange.

## Usage

```yaml
initialize:
  - uses: github.com/CognitionAI/actions/setup-devin-oidc@main
```

Request a token for a service that trusts Devin as an identity provider:

```bash
devin-oidc token --audience my-api
```

Select the Devin identity claims used to form the token subject:

```bash
devin-oidc token \
  --audience my-api \
  --subject-keys "org_id repository_name"
```

The resulting subject consists of `key:value` pairs. The default subject key is `org_id`.

## CLI commands

```text
devin-oidc token --audience <audience> [--subject-keys "<keys>"] [--exchange-url <url>]
devin-oidc print-general-token
```

| Option | Description |
| --- | --- |
| `--audience` | Required audience for the exchanged token |
| `--subject-keys` | Space-delimited claims used to form `sub`; defaults to `org_id` |
| `--exchange-url` | Override the token exchange endpoint |

Your target service must trust Devin as an OIDC identity provider and accept the requested audience.
