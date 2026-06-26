# Cognition Actions

Reusable [GitHub Actions](https://docs.github.com/en/actions/creating-actions) for [Devin's Declarative Repository Setup (DRS)](https://docs.devinenterprise.com/onboard-devin/environment/blueprint-reference).

Each action wraps a common DRS template pattern into a parameterized, tested action that can be used directly in blueprints via the `uses:` field. These cover language & runtime setup, private registries, enterprise infrastructure, workload identity (Devin OIDC), and other advanced patterns.

## Quick Start

Use any action in your DRS blueprint:

```yaml
initialize:
  - uses: github.com/CognitionAI/actions/setup-python-uv@main
    with:
      uv-version: "0.5.1"

  - uses: github.com/CognitionAI/actions/configure-pip-registry@main
    with:
      index-url: "https://nexus.corp.com/repository/pypi-proxy/simple"
      trusted-host: "nexus.corp.com"
```

## Action Catalog

### Language Setup (Aliases)

These are thin composite wrappers around official, trusted GitHub Actions. They provide a consistent `CognitionAI/actions/` namespace while delegating to the well-maintained upstream actions.

| Action | Delegates To | Description |
|--------|-------------|-------------|
| [`setup-python-pip`](./setup-python-pip) | [`actions/setup-python@v5`](https://github.com/actions/setup-python) | Install Python |
| [`setup-python-uv`](./setup-python-uv) | [`astral-sh/setup-uv@v5`](https://github.com/astral-sh/setup-uv) | Install uv package manager |
| [`setup-node-npm`](./setup-node-npm) | [`actions/setup-node@v4`](https://github.com/actions/setup-node) | Install Node.js |
| [`setup-node-pnpm`](./setup-node-pnpm) | [`actions/setup-node@v4`](https://github.com/actions/setup-node) + [`pnpm/action-setup@v4`](https://github.com/pnpm/action-setup) | Install Node.js + pnpm |
| [`setup-go`](./setup-go) | [`actions/setup-go@v5`](https://github.com/actions/setup-go) | Install Go |
| [`setup-java-gradle`](./setup-java-gradle) | [`actions/setup-java@v4`](https://github.com/actions/setup-java) + [`gradle/actions/setup-gradle@v4`](https://github.com/gradle/actions) | Install JDK + Gradle |
| [`setup-java-maven`](./setup-java-maven) | [`actions/setup-java@v4`](https://github.com/actions/setup-java) + [`stCarolas/setup-maven@v5`](https://github.com/stCarolas/setup-maven) | Install JDK + Maven |
| [`setup-ruby-rails`](./setup-ruby-rails) | [`ruby/setup-ruby@v1`](https://github.com/ruby/setup-ruby) | Install Ruby |
| [`setup-rust`](./setup-rust) | [`dtolnay/rust-toolchain@master`](https://github.com/dtolnay/rust-toolchain) | Install Rust toolchain |

> **Note:** You can also use the official actions directly in DRS blueprints (e.g. `uses: github.com/actions/setup-python@v5`). These aliases exist for convenience and consistent naming.

### Private Registries

Custom Node.js actions for configuring private package registries. No well-maintained GitHub Actions exist for these use cases.

| Action | Description |
|--------|-------------|
| [`configure-npm-scoped-registry`](./configure-npm-scoped-registry) | Point @scope to private npm registry |
| [`configure-npm-mirror`](./configure-npm-mirror) | Replace default npm registry |
| [`configure-pnpm-registry`](./configure-pnpm-registry) | Configure pnpm private registry |
| [`configure-yarn-registry`](./configure-yarn-registry) | Configure Yarn v1/v2+ registry |
| [`configure-pip-registry`](./configure-pip-registry) | Configure pip private PyPI |
| [`configure-poetry-registry`](./configure-poetry-registry) | Add Poetry private repository |
| [`configure-maven-registry`](./configure-maven-registry) | Configure Maven settings.xml |
| [`configure-gradle-registry`](./configure-gradle-registry) | Configure Gradle init script |
| [`configure-go-proxy`](./configure-go-proxy) | Set GOPROXY + GOPRIVATE |
| [`configure-nuget-registry`](./configure-nuget-registry) | Add NuGet package source |
| [`configure-docker-registry`](./configure-docker-registry) | Docker login to private registry |
| [`configure-cargo-registry`](./configure-cargo-registry) | Configure Cargo private crates |
| [`configure-bundler-registry`](./configure-bundler-registry) | Configure Bundler gem source |
| [`configure-composer-registry`](./configure-composer-registry) | Configure Composer repository |
| [`configure-codeartifact`](./configure-codeartifact) | AWS CodeArtifact token refresh |

### Enterprise Infrastructure

Custom Node.js actions for enterprise environment configuration. These address use cases with no existing GitHub Actions alternatives.

| Action | Description |
|--------|-------------|
| [`install-ca-certificate`](./install-ca-certificate) | Install corporate CA certificates |
| [`configure-proxy`](./configure-proxy) | Configure HTTP/HTTPS proxy |
| [`configure-proxy-auth`](./configure-proxy-auth) | Configure authenticated proxy |
| [`setup-vpn-openvpn`](./setup-vpn-openvpn) | Start OpenVPN connection |
| [`setup-vpn-wireguard`](./setup-vpn-wireguard) | Start WireGuard connection |
| [`configure-dns`](./configure-dns) | Custom /etc/hosts and resolv.conf |
| [`configure-gpg-signing`](./configure-gpg-signing) | GPG commit signing |
| [`configure-ssh-keys`](./configure-ssh-keys) | Install SSH keys |
| [`install-system-packages`](./install-system-packages) | Install apt packages |
| [`set-env-vars`](./set-env-vars) | Persistent environment variables |
| [`configure-locale`](./configure-locale) | Set locale and timezone |
| [`configure-ulimits`](./configure-ulimits) | Set resource limits |
| [`configure-apt-mirror`](./configure-apt-mirror) | Replace apt mirror |

### Workload Identity (Devin OIDC)

Devin sessions carry a general OIDC token (refreshed by the platform at `/opt/.devin/oidc_token`) that can be exchanged for short-lived audience-scoped OIDC tokens via Devin's RFC 8693 token exchange endpoint. External systems (e.g. AWS IAM) can trust Devin as an OIDC identity provider and grant credentials to sessions without any long-lived secrets.

| Action | Description |
|--------|-------------|
| [`setup-devin-oidc`](./setup-devin-oidc) | Install the `devin-oidc` CLI for OIDC token exchange |
| [`setup-aws-oidc`](./setup-aws-oidc) | Configure the AWS CLI to assume an IAM role with Devin OIDC tokens |
| [`setup-vault-oidc`](./setup-vault-oidc) | Configure the Vault CLI to authenticate via JWT auth with Devin OIDC tokens |
| [`setup-jfrog-oidc`](./setup-jfrog-oidc) | Configure the JFrog CLI to authenticate via OIDC token exchange with auto-refresh |

```yaml
initialize:
  - uses: github.com/CognitionAI/actions/setup-aws-oidc@main
    with:
      role-arn: "arn:aws:iam::123456789012:role/devin-sessions"
      region: "us-east-1"
```

`setup-devin-oidc` installs `devin-oidc`, which reads the session's general token, derives the exchange endpoint from the token's `iss` claim, and falls back to the tenant git proxy (required for orgs on dedicated gitproxy tenants, where the proxy attaches its attestation header):

```sh
devin-oidc token --audience my-api --subject-keys "org_id"
```

`setup-aws-oidc` builds on it: it installs a `credential_process` helper that exchanges a fresh token (audience `sts.amazonaws.com` by default) and calls the unsigned `aws sts assume-role-with-web-identity` API, then writes the AWS profile. Because exchanged tokens are short-lived (~1 minute), `credential_process` is used instead of a static `web_identity_token_file` — the AWS CLI/SDKs re-run it whenever the assumed-role credentials expire.

On the AWS side, create an IAM OIDC identity provider for your Devin webapp origin (e.g. `https://app.devin.ai`, or your custom host) with the audience as the client ID, and give the role a trust policy like:

```json
{
  "Effect": "Allow",
  "Principal": { "Federated": "arn:aws:iam::123456789012:oidc-provider/app.devin.ai" },
  "Action": "sts:AssumeRoleWithWebIdentity",
  "Condition": {
    "StringEquals": {
      "app.devin.ai:aud": "sts.amazonaws.com",
      "app.devin.ai:sub": "org_id:<your-org-id>"
    }
  }
}
```

The `sub` claim is composed from the `subject-keys` input as `key:value` pairs (default `org_id` → `org_id:<org-id>`).

`setup-vault-oidc` builds on `setup-devin-oidc` to configure [HashiCorp Vault JWT/OIDC auth](https://developer.hashicorp.com/vault/docs/auth/jwt). It installs a custom [token helper](https://developer.hashicorp.com/vault/docs/commands/token-helper) that exchanges a Devin OIDC token for a Vault client token on every `vault` CLI invocation, caching the result for 5 minutes. It also exports `VAULT_ADDR` (and `VAULT_NAMESPACE` for enterprise).

```yaml
initialize:
  - uses: github.com/CognitionAI/actions/setup-vault-oidc@main
    with:
      vault-addr: "https://vault.corp.com:8200"
      role: "devin-sessions"
```

On the Vault side, enable the JWT auth method and create a role that trusts the Devin OIDC provider:

```bash
vault auth enable jwt

vault write auth/jwt/config \
  oidc_discovery_url="https://app.devin.ai" \
  default_role="devin-sessions"

vault write auth/jwt/role/devin-sessions \
  role_type="jwt" \
  bound_audiences="https://vault.corp.com:8200" \
  user_claim="sub" \
  policies="devin-read" \
  ttl="1h"
```

`setup-jfrog-oidc` configures the [JFrog CLI](https://docs.jfrog.com/integrations/docs/jfrog-cli) to authenticate via [JFrog OIDC token exchange](https://docs.jfrog.com/administration/docs/openid-connect-integration). It installs a `jf` wrapper that transparently refreshes credentials on 401 — exchanging a fresh Devin OIDC token for a JFrog access token and retrying the command. All `jf` subcommands (`jf npm install`, `jf docker pull`, `jf pip install`, etc.) get automatic auth without any manual token management.

```yaml
initialize:
  - uses: github.com/CognitionAI/actions/setup-jfrog-oidc@main
    with:
      jfrog-url: "https://mycompany.jfrog.io"
      provider-name: "devin-oidc"
```

On the JFrog side, create a Generic OIDC integration that trusts the Devin OIDC provider, then add an identity mapping:

```bash
# Create OIDC integration
curl -X POST "https://mycompany.jfrog.io/access/api/v1/oidc" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "devin-oidc",
    "issuer_url": "https://app.devin.ai",
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
    "claims": {"sub": "org_id:<your-devin-org-id>"},
    "token_spec": {
      "scope": "applied-permissions/groups:devin-developers",
      "expires_in": 3600
    }
  }'
```

### Advanced Patterns

| Action | Description |
|--------|-------------|
| [`setup-direnv`](./setup-direnv) | Install direnv with .envrc |
| [`setup-nvm-auto`](./setup-nvm-auto) | nvm auto-switching on cd |
| [`setup-playwright`](./setup-playwright) | Install Playwright + browsers |
| [`setup-caddy-proxy`](./setup-caddy-proxy) | Caddy local HTTPS reverse proxy |

## Architecture

This library contains two types of actions:

### Alias Actions (Language Setup)

Thin composite wrappers that delegate to official upstream actions:

```
<action-name>/
  action.yml      # Composite action with uses: pointing to official action
```

These exist so users can reference all DRS actions from a single namespace. The upstream actions handle the actual installation.

### Custom Actions (Registries, Enterprise, Advanced)

Full Node.js GitHub Actions with custom implementation:

```
<action-name>/
  action.yml      # Metadata: name, description, inputs, runs.using: "node20"
  src/main.ts     # TypeScript source
  dist/index.js   # Compiled bundle (via @vercel/ncc)
```

Actions use `@actions/core` for input/output and `@actions/exec` for shell commands. Environment variables and PATH changes are propagated through both GitHub Actions mechanisms (`GITHUB_ENV`, `GITHUB_PATH`) and Devin's `ENVRC` file for session persistence.

### Shared Helpers

All custom actions import from [`shared/drs.ts`](./shared/drs.ts):

| Function | Description |
|----------|-------------|
| `run(cmd)` | Execute shell command, throw on failure |
| `tryRun(cmd)` | Execute shell command, return exit code |
| `addPath(dir)` | Add to PATH + ENVRC |
| `exportVariable(name, val)` | Export env var + ENVRC |
| `appendToEnvrc(line)` | Write directly to ENVRC |
| `writeFileWithSudo(path, content)` | Write system config file |
| `writeFile(path, content)` | Write user config file |
| `getArch()` | Get system architecture (amd64/arm64) |
| `commandExists(cmd)` | Check if command is on PATH |

## Secrets in Blueprints

Use `$SECRET_NAME` syntax in blueprint `with:` values to reference secrets:

```yaml
initialize:
  - uses: github.com/CognitionAI/actions/configure-npm-scoped-registry@main
    with:
      scope: "@mycompany"
      registry-url: "https://npm.pkg.github.com"
      auth-token: $GITHUB_NPM_TOKEN
```

## Development

### Prerequisites

- Node.js 20+
- npm

### Setup

```bash
npm install
```

### Build

```bash
npm run build    # Compiles all custom Node.js actions via @vercel/ncc
```

### Type Check

```bash
npm run lint     # tsc --noEmit
```

### Adding a New Action

**Custom action:**

1. Create `<action-name>/action.yml` with `runs.using: "node20"` and `main: "dist/index.js"`
2. Create `<action-name>/src/main.ts` importing from `../../shared/drs`
3. Run `npm run build` to compile
4. Test with `./scripts/test-action.sh`

**Alias action:**

1. Create `<action-name>/action.yml` with `runs.using: "composite"` and a `steps:` block that `uses:` the upstream action
2. Map inputs through to the upstream action's inputs

**For all actions:**

Every `action.yml` must include a `category` field (after `description`). Valid categories: `Language & runtime setup`, `Private registries`, `Enterprise infrastructure`, `Workload identity (Devin OIDC)`, `Advanced patterns`.

### Publishing Changes

After merging changes to `main`, **create a new GitHub release** to publish the updates. Changes on `main` without a release will not be visible to users.

1. Go to [Releases](https://github.com/CognitionAI/actions/releases/new)
2. Create a new tag following semver (e.g. `v1.0.0`, `v1.1.0`)
3. Auto-generate release notes and publish
