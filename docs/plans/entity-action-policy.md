# Plan: Entity Action Policy

## Status

Implemented for the central entity mutation tools and Relay defaults.

Shared-space trust now lets configured spaces resolve callers to `trusted`. That is useful for collaboration, but too broad for mutation tools: a trusted collaborator should be able to contribute team content without being able to delete records or rewrite derived/system-maintained memory.

This plan replaces the old shared-space trust follow-up notes with the implemented scope and remaining follow-up questions.

## Goal

Add a central policy layer for entity mutations so the minimum permission level can vary by `entityType` and action.

The first target is Relay:

- collaborators can create/update normal team-authored content;
- deletes default to Owner/anchor;
- derived/system-maintained records are anchor-only by default;
- denial messages identify the blocked action and required level.

## Non-goals

- Full RBAC or custom roles.
- Runtime users/People UI.
- A fourth permission level such as `admin`.
- Per-field permissions.
- Read/search/list visibility changes; entity visibility already handles those paths.
- Slack/Teams/shared-web trust integration.

## Policy model

Use existing permission levels as policy values:

- `public`
- `trusted`
- `anchor`

Implemented actions:

- `create`
- `update`
- `delete`

Next action:

- `extract` — govern `system_extract` because it creates or rebuilds derived/system-maintained records.

Future actions can be added only when there is a concrete mutating tool that needs them, for example `setCover` or `publish`.

### Config shape

Add entity action overrides under the existing `permissions` block:

```yaml
permissions:
  entityActions:
    "*":
      create: anchor
      update: anchor
      delete: anchor
      extract: anchor
```

Collaborative brain models or instances can loosen selected actions explicitly:

```yaml
permissions:
  entityActions:
    "*":
      create: trusted
      update: trusted
      delete: anchor
      extract: anchor
```

Rules:

- `"*"` is the default for any entity type without an explicit override.
- Entity-specific entries merge over `"*"`.
- Omitted actions inherit from `"*"`.
- The platform fallback is most restrictive: if no type-specific rule applies, require `anchor` for mutating/extracting actions.
- Defaults are layered, from lowest to highest priority:
  1. platform fallback: anchor-only for `create`, `update`, `delete`, and `extract`;
  2. plugin/entity exceptions only when they differ from the platform fallback (for example `delete: never`);
  3. brain model defaults for model-level collaboration posture;
  4. instance config overrides.

### Default ownership

The platform fallback should be conservative enough that Rover/personal brains can simply inherit it: durable mutations and extraction are owner/operator-only unless explicitly loosened.

Entity/plugin packages should not restate the anchor-only platform fallback. They should declare only exceptions that are stricter or genuinely different across all brains. Examples:

- singleton records such as `anchor-profile`, `brain-character`, and `site-info` declare singleton semantics through their adapters; central system deletion refuses singleton deletes;
- an entity type with an explicitly public capture surface could declare a looser default if that is safe in every brain, though this should be rare.

Brain models should only loosen policy where their collaboration posture requires it:

- Relay can set `"*"` to trusted create/update and anchor delete/extract for team-authored content;
- Rover should inherit the anchor-only fallback unless a specific public/trusted capture flow is explicitly designed.

Instance config remains the final override layer for operators who need to loosen or tighten a single entity type/action. If some entity actions must never be loosened, use a separate hard-deny value such as `never` rather than relying on default precedence.

## Relay default policy

Relay should only need to install the model-level loosening from the platform fallback:

| entity type | create    | update    | delete   | extract  | reason                                                                  |
| ----------- | --------- | --------- | -------- | -------- | ----------------------------------------------------------------------- |
| `*`         | `trusted` | `trusted` | `anchor` | `anchor` | safe default for team-authored content; deletes/extracts are owner-only |

## Enforcement points

Enforce policy in central mutation tools before calling entity services or plugin-specific write paths:

- `system_create`
- `system_update`
- `system_delete`
- `system_extract` once the `extract` action lands

Do not make each entity plugin responsible for this check.

Plugin create interceptors must not bypass the policy. The check should run after the requested/derived `entityType` is known and before the interceptor or entity service writes anything.

If an operation changes the effective entity type, run the check against the final entity type.

## Denial behavior

Denied mutations should return a user-facing message with:

- action;
- entity type;
- caller level;
- required level.

Example:

> Updating `summary` requires Owner/anchor permission; your current permission is Collaborator/trusted.

## Implementation steps

- [x] Add typed policy definitions and parser/default-merging logic.
- [x] Expose resolved entity action policy through the app/permission layer.
- [x] Add `assertEntityActionAllowed(entityType, action, context)` enforcement helper.
- [x] Call the helper from `system_create`, `system_update`, and `system_delete`.
- [x] Re-check create policy after a plugin create interceptor changes the effective entity type.
- [x] Add Relay model defaults matching the table above.
- [x] Replace Relay's broad wildcard loosening/protected-type list with an explicit collaborator-editable allowlist; unlisted types inherit the platform fallback.
- [x] Add the restrictive platform fallback so Rover/personal brains can inherit anchor-only durable mutations by default.
- [x] Add and enforce the `extract` action for `system_extract`.
- [x] Make singleton entity deletion a generic central denial based on adapter singleton semantics, not a Relay or type-name policy list.
- [x] Add tests for policy parsing, default/override merging, central tool enforcement, interceptor non-bypass, and denial messages.
- [x] Update Relay docs with the collaborator vs owner mutation model.

## Validation matrix

- public caller cannot create/update/delete Relay team content unless instance policy explicitly allows it.
- trusted caller can create `base`, `link`, `decision`, and `action-item`.
- trusted caller can update `base`, `link`, `decision`, and `action-item`.
- trusted caller cannot delete or extract any entity by default.
- trusted caller cannot create/update/delete/extract `topic`, `summary`, `agent`, `skill`, or `swot`.
- trusted caller cannot mutate `prompt`, `site-info`, `site-content`, `anchor-profile`, or `brain-character`.
- anchor caller can create/update/delete under the default policy.
- Rover/personal brains inherit anchor-only durable mutation/extraction unless explicitly loosened.
- instance config can loosen/tighten a single entity type without replacing the whole policy.
- denial messages include action, entity type, caller level, and required level.

## Open decisions

1. Whether status changes/publish flows need a separate `publish` action or can remain covered by `update` for now.
