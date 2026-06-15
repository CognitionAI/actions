# Cognition Actions

Reusable actions for giving Devin sessions short-lived access to services through OpenID Connect (OIDC), without storing long-lived credentials in Devin.

These actions are intended for the `initialize` section of a Devin environment blueprint.

## Available actions

### `setup-devin-oidc`

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

### `setup-aws-oidc`

Configures AWS CLI and SDK authentication for a Devin session. Use this action after configuring an AWS IAM OIDC provider and an IAM role that trusts your Devin organization.

```yaml
initialize:
  - uses: github.com/CognitionAI/actions/setup-aws-oidc@main
    with:
      role-arn: "arn:aws:iam::123456789012:role/devin-sessions"
      region: "us-east-1"
```

AWS commands and SDKs can then use the configured profile without static AWS credentials:

```bash
aws sts get-caller-identity
```

#### Inputs

| Input | Required | Default | Description |
| --- | --- | --- | --- |
| `role-arn` | Yes | — | ARN of the IAM role to assume |
| `region` | No | — | AWS region for the profile |
| `profile` | No | `default` | AWS profile to configure |
| `audience` | No | `sts.amazonaws.com` | Audience configured for the AWS IAM OIDC provider |
| `subject-keys` | No | `org_id` | Space-delimited Devin claim names used to form the token subject |
| `session-name` | No | `devin` | AWS role session name |
| `duration-seconds` | No | `3600` | Duration of the assumed-role session, subject to the role's maximum session duration |

To use a named profile:

```yaml
initialize:
  - uses: github.com/CognitionAI/actions/setup-aws-oidc@main
    with:
      role-arn: "arn:aws:iam::123456789012:role/devin-sessions"
      region: "us-east-1"
      profile: "devin"
```

```bash
aws sts get-caller-identity --profile devin
```

## AWS prerequisites

Before using `setup-aws-oidc`, an AWS administrator must:

1. Create an IAM OIDC identity provider for the Devin host used by your organization.
2. Add `sts.amazonaws.com` as an audience, unless the action's `audience` input will use another configured value.
3. Create an IAM role whose trust policy permits Devin identities to call `sts:AssumeRoleWithWebIdentity`.
4. Grant that role only the AWS permissions Devin requires.

The role's subject condition must match the claims selected by `subject-keys`. With the default `org_id`, the subject has the form `org_id:<your-org-id>`.

For your Devin OIDC provider URL and organization ID, contact your Devin administrator or Cognition support.
