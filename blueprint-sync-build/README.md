# blueprint-sync-build

Sync a repository's [git-backed blueprint](https://docs.devin.ai/onboard-devin/environment/git-backed-blueprints) (`.devin/blueprint.yaml`) to Devin, trigger a snapshot build, and optionally wait for the build to finish.

Unlike the `setup-*-oidc` actions in this repo, this action runs in a **GitHub Actions workflow** (not in a blueprint). Typical use: a post-merge workflow that keeps Devin's environment in sync whenever the blueprint file changes.

> The snapshot-setup API is in beta (`/v3beta1/`). Endpoint paths and shapes may change before promotion to `/v3/`.

## Usage

```yaml
name: Sync Devin blueprint
on:
  push:
    branches: [main]
    paths: [".devin/blueprint.yaml"]

jobs:
  sync:
    runs-on: ubuntu-latest
    steps:
      - uses: CognitionAI/actions/blueprint-sync-build@main
        with:
          api-key: ${{ secrets.DEVIN_API_KEY }}
          org-id: ${{ vars.DEVIN_ORG_ID }}
```

To validate a blueprint change on a pull request instead, check out the PR, push the candidate contents with the blueprints API (or run with `sync: "false"` against a test org), and use `build: "true"` + `wait: "true"` so the job fails when the snapshot build fails.

## Inputs

| Input | Required | Default | Description |
| --- | --- | --- | --- |
| `api-key` | yes | — | Devin API key (service user or PAT). Store as a repo/org secret. |
| `org-id` | yes | — | Devin organization ID. |
| `repo` | no | `${{ github.repository }}` | Repository to sync, `owner/repo` or a full provider URL. |
| `base-url` | no | `https://api.devin.ai` | Devin API base URL. |
| `sync` | no | `true` | Sync the blueprint from Git before building. |
| `build` | no | `true` | Trigger a snapshot build after syncing. |
| `wait` | no | `true` | Wait for the build and fail the step if it fails. |
| `timeout-minutes` | no | `60` | Max time to wait for the build. |

## Outputs

| Output | Description |
| --- | --- |
| `build-id` | ID of the triggered build (empty when `build: "false"`). |
| `build-status` | Final status: `pending`, `running`, `succeeded`, `failed`, or `cancelled`. |

## API calls made

All calls hit `{base-url}/v3beta1/organizations/{org-id}/snapshot-setup` with `Authorization: Bearer {api-key}`:

1. `POST /sync` with `{"repo_name": "<repo>"}` — pulls `.devin/blueprint.yaml` from the repo's default branch.
2. `POST /builds` — triggers a snapshot build of the org's current blueprints.
3. `GET /builds/{build_id}` — polled every 30s until the build finishes.
