# `setup-vault-oidc`

Configures the HashiCorp Vault CLI to authenticate through Vault's JWT/OIDC auth method with short-lived Devin OIDC tokens. The action installs `devin-oidc`, optionally installs Vault, configures a Vault token helper, and exports `VAULT_ADDR` and, when provided, `VAULT_NAMESPACE`.

The token helper exchanges a Devin OIDC token for a Vault client token and caches the Vault token for five minutes.

## Usage

```yaml
initialize:
  - uses: github.com/CognitionAI/actions/setup-vault-oidc@main
    with:
      vault-addr: "https://vault.example.com:8200"
      role: "devin-sessions"
```

Vault commands then authenticate automatically:

```bash
vault token lookup
vault kv get secret/example
```

## Inputs

| Input | Required | Default | Description |
| --- | --- | --- | --- |
| `vault-addr` | Yes | — | Vault server address |
| `role` | Yes | — | Vault JWT/OIDC auth role |
| `auth-mount` | No | `jwt` | Mount path of the JWT/OIDC auth method |
| `audience` | No | `vault-addr` | OIDC audience; must match the role's `bound_audiences` |
| `subject-keys` | No | `org_id` | Space-delimited Devin claims used to form the token subject |
| `vault-namespace` | No | — | Vault Enterprise namespace |
| `install-vault` | No | `true` | Whether to install the Vault CLI if it is absent |
| `vault-version` | No | `1.17.2` | Vault CLI version to install |

## Vault prerequisites

Enable and configure Vault JWT auth for Devin's OIDC issuer. The configured role must allow the audience and subject produced by this action. For example:

```bash
vault auth enable jwt
vault write auth/jwt/config \
  oidc_discovery_url="https://app.devin.ai"

vault write auth/jwt/role/devin-sessions \
  role_type="jwt" \
  bound_audiences="https://vault.example.com:8200" \
  bound_subject="org_id:<your-org-id>" \
  user_claim="sub" \
  policies="devin"
```

Adjust the issuer, audience, subject, and policies for your deployment. If the auth method is mounted somewhere other than `jwt`, set `auth-mount`.
