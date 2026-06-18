# `setup-aws-oidc`

Configures AWS CLI and SDK authentication for a Devin session. The action installs `devin-oidc` and an AWS `credential_process` helper that exchanges a fresh Devin token and calls `AssumeRoleWithWebIdentity`, avoiding static AWS credentials.

## Usage

```yaml
initialize:
  - uses: github.com/CognitionAI/actions/setup-aws-oidc@main
    with:
      role-arn: "arn:aws:iam::123456789012:role/devin-sessions"
      region: "us-east-1"
```

AWS commands and SDKs can then use the configured profile:

```bash
aws sts get-caller-identity
```

## Inputs

| Input | Required | Default | Description |
| --- | --- | --- | --- |
| `role-arn` | Yes | — | ARN of the IAM role to assume |
| `region` | No | — | AWS region for the profile |
| `profile` | No | `default` | AWS profile to configure |
| `audience` | No | `sts.amazonaws.com` | Audience configured for the AWS IAM OIDC provider |
| `subject-keys` | No | `org_id` | Space-delimited Devin claims used to form the token subject |
| `session-name` | No | `devin` | AWS role session name |
| `duration-seconds` | No | `3600` | Assumed-role session duration, subject to the role maximum |

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

An AWS administrator must:

1. Create an IAM OIDC identity provider for the Devin host used by your organization.
2. Add `sts.amazonaws.com` as an audience unless the action uses another configured value.
3. Create an IAM role whose trust policy permits Devin identities to call `sts:AssumeRoleWithWebIdentity`.
4. Grant that role only the AWS permissions Devin requires.

The role's subject condition must match the claims selected by `subject-keys`. With the default `org_id`, the subject is `org_id:<your-org-id>`.

For your Devin OIDC provider URL and organization ID, contact your Devin administrator or Cognition support.
