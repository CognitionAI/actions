# `setup-gcp-oidc`

Configures the gcloud CLI and Google Cloud client libraries to authenticate through [Workload Identity Federation](https://cloud.google.com/iam/docs/workload-identity-federation) with short-lived Devin OIDC tokens. The action installs `devin-oidc`, optionally installs gcloud, writes an external account credential configuration with an executable credential source, and exports `GOOGLE_APPLICATION_CREDENTIALS`.

The executable credential source is re-invoked by gcloud and the client libraries whenever a fresh token is needed, so no long-lived credentials are stored.

## Usage

```yaml
initialize:
  - uses: github.com/CognitionAI/actions/setup-gcp-oidc@main
    with:
      workload-identity-provider: "projects/123456789/locations/global/workloadIdentityPools/devin/providers/devin-oidc"
      service-account: "devin@my-project.iam.gserviceaccount.com"
      project: "my-project"
```

gcloud and Google Cloud SDKs then authenticate automatically:

```bash
gcloud storage ls
gcloud auth print-access-token
```

## Inputs

| Input | Required | Default | Description |
| --- | --- | --- | --- |
| `workload-identity-provider` | Yes | — | Full resource name of the workload identity pool provider (`projects/<number>/locations/global/workloadIdentityPools/<pool>/providers/<provider>`) |
| `service-account` | No | — | Service account email to impersonate; leave empty to use the federated identity directly |
| `audience` | No | `https://iam.googleapis.com/` + provider | OIDC audience; must be in the provider's allowed audiences |
| `subject-keys` | No | `org_id` | Space-delimited Devin claims used to form the token subject |
| `project` | No | — | Default project ID to set on the gcloud config |
| `install-gcloud` | No | `true` | Whether to install the gcloud CLI if it is absent |

## GCP prerequisites

Create a workload identity pool and provider that trusts Devin's OIDC issuer:

```bash
gcloud iam workload-identity-pools create devin \
  --location=global

gcloud iam workload-identity-pools providers create-oidc devin-oidc \
  --location=global \
  --workload-identity-pool=devin \
  --issuer-uri="https://app.devin.ai" \
  --attribute-mapping="google.subject=assertion.sub" \
  --attribute-condition="assertion.sub == 'org_id:<your-org-id>'"
```

To impersonate a service account, grant the federated identity permission to do so:

```bash
gcloud iam service-accounts add-iam-policy-binding devin@my-project.iam.gserviceaccount.com \
  --role=roles/iam.workloadIdentityUser \
  --member="principal://iam.googleapis.com/projects/<number>/locations/global/workloadIdentityPools/devin/subject/org_id:<your-org-id>"
```

Adjust the issuer, attribute mapping, and conditions for your deployment. The token's `sub` claim is composed from the claims listed in `subject-keys` (for example `org_id:<your-org-id>`).
