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

Initial actions:

- `create`
- `update`
- `delete`

Future actions can be added only when there is a concrete mutating tool that needs them, for example `setCover`, `publish`, or `extract`.

### Config shape

Add entity action overrides under the existing `permissions` block:

```yaml
permissions:
  entityActions:
    "*":
      create: trusted
      update: trusted
      delete: anchor
    topic:
      create: anchor
      update: anchor
      delete: anchor
    summary:
      create: anchor
      update: anchor
      delete: anchor
```

Rules:

- `"*"` is the default for any entity type without an explicit override.
- Entity-specific entries merge over `"*"`.
- Omitted actions inherit from `"*"`.
- If no policy is configured, preserve existing behavior for backward compatibility.
- Brain models may provide defaults; instance config may override them.

## Relay default policy

Relay installs this default policy:

| entity type       | create    | update    | delete   | reason                                                                |
| ----------------- | --------- | --------- | -------- | --------------------------------------------------------------------- |
| `*`               | `trusted` | `trusted` | `anchor` | safe default for team-authored content; deletes are owner-only        |
| `base`            | `trusted` | `trusted` | `anchor` | notes/general team memory                                             |
| `link`            | `trusted` | `trusted` | `anchor` | shared references                                                     |
| `doc`             | `trusted` | `trusted` | `anchor` | full-preset team docs                                                 |
| `deck`            | `trusted` | `trusted` | `anchor` | full-preset team presentations                                        |
| `decision`        | `trusted` | `trusted` | `anchor` | canonical team decisions, editable but not deletable by collaborators |
| `action-item`     | `trusted` | `trusted` | `anchor` | team follow-ups                                                       |
| `image`           | `trusted` | `trusted` | `anchor` | site/team assets in default preset                                    |
| `site-info`       | `anchor`  | `anchor`  | `anchor` | public identity/config                                                |
| `site-content`    | `anchor`  | `anchor`  | `anchor` | public site route copy                                                |
| `prompt`          | `anchor`  | `anchor`  | `anchor` | prompt/template behavior                                              |
| `anchor-profile`  | `anchor`  | `anchor`  | `anchor` | owner/team identity                                                   |
| `brain-character` | `anchor`  | `anchor`  | `anchor` | brain identity/instructions                                           |
| `topic`           | `anchor`  | `anchor`  | `anchor` | derived synthesis artifact                                            |
| `summary`         | `anchor`  | `anchor`  | `anchor` | system-maintained conversation memory                                 |
| `agent`           | `anchor`  | `anchor`  | `anchor` | peer-brain trust boundary                                             |
| `skill`           | `anchor`  | `anchor`  | `anchor` | derived agent capability record                                       |
| `swot`            | `anchor`  | `anchor`  | `anchor` | derived assessment output                                             |

## Enforcement points

Enforce policy in central mutation tools before calling entity services or plugin-specific write paths:

- `system_create`
- `system_update`
- `system_delete`

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
- [x] Add tests for policy parsing, default/override merging, central tool enforcement, interceptor non-bypass, and denial messages.
- [x] Update Relay docs with the collaborator vs owner mutation model.

## Validation matrix

- public caller cannot create/update/delete Relay team content unless instance policy explicitly allows it.
- trusted caller can create `base`, `link`, `decision`, and `action-item`.
- trusted caller can update `base`, `link`, `decision`, and `action-item`.
- trusted caller cannot delete any entity by default.
- trusted caller cannot create/update/delete `topic`, `summary`, `agent`, `skill`, or `swot`.
- trusted caller cannot mutate `prompt`, `site-info`, `site-content`, `anchor-profile`, or `brain-character`.
- anchor caller can create/update/delete under the default policy.
- instance config can loosen/tighten a single entity type without replacing the whole policy.
- denial messages include action, entity type, caller level, and required level.

## Open decisions

1. Whether `system_extract` should be governed by this policy or wait for a separate `extract` action once its mutation behavior is audited.
2. Whether status changes/publish flows need a separate `publish` action or can remain covered by `update` for now.
