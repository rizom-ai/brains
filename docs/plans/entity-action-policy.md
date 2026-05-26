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
    topic:
      create: anchor
      update: anchor
      delete: anchor
      extract: anchor
```

Rules:

- `"*"` is the default for any entity type without an explicit override.
- Entity-specific entries merge over `"*"`.
- Omitted actions inherit from `"*"`.
- The platform fallback should be most restrictive: if action policy is enabled but no type-specific rule applies, require `anchor` for mutating/extracting actions.
- If no policy is configured at all, preserve existing behavior until the compatibility window closes.
- Defaults should be layered, from lowest to highest priority:
  1. platform fallback: anchor-only for `create`, `update`, `delete`, and `extract`;
  2. entity/plugin defaults for entity-owned safety constraints;
  3. brain model defaults for model-level collaboration posture;
  4. instance config overrides.

### Default ownership

The platform fallback should be conservative enough that Rover/personal brains can simply inherit it: durable mutations and extraction are owner/operator-only unless explicitly loosened.

Entity/plugin packages should own defaults that are true for the entity type in every brain. Examples:

- derived/system-maintained entities such as `topic`, `summary`, `skill`, and `swot` should remain owner-only for mutation and extraction;
- identity/config entities such as `anchor-profile`, `brain-character`, `site-info`, `site-content`, and `prompt` should remain owner-only for mutation;
- peer-brain trust-boundary entities such as `agent` should remain owner-only for mutation.

Brain models should only loosen policy where their collaboration posture requires it:

- Relay can set `"*"` to trusted create/update and anchor delete/extract for team-authored content;
- Rover should inherit the anchor-only fallback unless a specific public/trusted capture flow is explicitly designed.

Instance config remains the final override layer for operators who need to loosen or tighten a single entity type/action. If some entity actions must never be loosened, use a separate hard-deny value such as `never` rather than relying on default precedence.

## Relay default policy

Current Relay installs this explicit default policy. After platform/entity/plugin defaults exist, Relay should shrink toward only its model-level loosening and Relay-specific exceptions.

| entity type       | create    | update    | delete   | extract  | reason                                                                  |
| ----------------- | --------- | --------- | -------- | -------- | ----------------------------------------------------------------------- |
| `*`               | `trusted` | `trusted` | `anchor` | `anchor` | safe default for team-authored content; deletes/extracts are owner-only |
| `base`            | `trusted` | `trusted` | `anchor` | `anchor` | notes/general team memory                                               |
| `link`            | `trusted` | `trusted` | `anchor` | `anchor` | shared references                                                       |
| `doc`             | `trusted` | `trusted` | `anchor` | `anchor` | full-preset team docs                                                   |
| `deck`            | `trusted` | `trusted` | `anchor` | `anchor` | full-preset team presentations                                          |
| `decision`        | `trusted` | `trusted` | `anchor` | `anchor` | canonical team decisions, editable but not deletable by collaborators   |
| `action-item`     | `trusted` | `trusted` | `anchor` | `anchor` | team follow-ups                                                         |
| `image`           | `trusted` | `trusted` | `anchor` | `anchor` | site/team assets in default preset                                      |
| `site-info`       | `anchor`  | `anchor`  | `anchor` | `anchor` | public identity/config                                                  |
| `site-content`    | `anchor`  | `anchor`  | `anchor` | `anchor` | public site route copy                                                  |
| `prompt`          | `anchor`  | `anchor`  | `anchor` | `anchor` | prompt/template behavior                                                |
| `anchor-profile`  | `anchor`  | `anchor`  | `anchor` | `anchor` | owner/team identity                                                     |
| `brain-character` | `anchor`  | `anchor`  | `anchor` | `anchor` | brain identity/instructions                                             |
| `topic`           | `anchor`  | `anchor`  | `anchor` | `anchor` | derived synthesis artifact                                              |
| `summary`         | `anchor`  | `anchor`  | `anchor` | `anchor` | system-maintained conversation memory                                   |
| `agent`           | `anchor`  | `anchor`  | `anchor` | `anchor` | peer-brain trust boundary                                               |
| `skill`           | `anchor`  | `anchor`  | `anchor` | `anchor` | derived agent capability record                                         |
| `swot`            | `anchor`  | `anchor`  | `anchor` | `anchor` | derived assessment output                                               |

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
- [ ] Move entity-owned defaults from Relay into entity/plugin declarations and merge them before brain and instance overrides.
- [ ] Add the restrictive platform fallback so Rover/personal brains can inherit anchor-only durable mutations by default.
- [ ] Add and enforce the `extract` action for `system_extract`.
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

1. Exact plugin/entity API for declaring default entity action policy.
2. Whether Rover should enforce anchor-only durable mutations immediately or preserve current behavior until a migration note/release boundary.
3. Whether status changes/publish flows need a separate `publish` action or can remain covered by `update` for now.
