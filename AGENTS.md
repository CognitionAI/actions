# AGENTS

## Releases

After merging changes to `main`, you **must** create a new GitHub release to publish the updates.

Without a new release, merged changes will not be visible to users.

## action.yml requirements

Every action directory must have an `action.yml` with these top-level fields:

- `name`: Human-readable action name
- `description`: What the action does
- `category`: One of `Language & runtime setup`, `Private registries`, `Enterprise infrastructure`, `Workload identity (Devin OIDC)`, `Advanced patterns`
- `inputs`: Map of input parameters

If `category` is omitted, the action falls into "Other".
