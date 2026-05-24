# Plan: Entity Action Policy

## Status

Implemented in `eac3c0148`.

This plan is now a short design record for the implemented Relay/shared-space trust hardening slice. Shared-space trust can resolve callers in configured spaces to `trusted`; entity action policy constrains what those collaborators can mutate.

## Implemented behavior

Entity mutations can declare the minimum permission level required by `entityType` and action.

Supported actions:

- `create`
- `update`
- `delete`

Supported levels:

- `public`
- `trusted`
- `anchor`

Configuration lives under `permissions.entityActions`:

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
- If no policy is configured, existing mutation-tool behavior is preserved for backward compatibility.
- Brain model defaults and instance `brain.yaml` overrides merge into one effective policy.

## Enforcement points

Policy is enforced centrally in:

- `system_create`
- `system_update`
- `system_delete`

Entity plugins do not enforce their own policy. Create interceptors cannot bypass policy: `system_create` checks the requested entity type and checks again if an interceptor rewrites the effective entity type.

Read/search/list access is unchanged and remains governed by entity visibility.

## Relay default policy

Relay installs a default policy where collaborators can contribute normal team content, while deletes and system/derived entities stay owner-only.

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

## Denial behavior

Denied mutations return user-facing errors that include action, entity type, required level, and caller level.

Example:

> Update summary requires Owner/anchor permission; your current permission is Collaborator/trusted.

## Validation

Implemented coverage includes:

- policy resolution with exact entity overrides and wildcard defaults;
- permission-level checks for allowed/denied entity actions;
- `system_create` enforcement before generic direct create;
- `system_create` enforcement after create interceptors rewrite entity type;
- `system_update` enforcement;
- `system_delete` enforcement;
- denial-message assertions;
- typechecks for templates, app, core, and Relay.

## Deferred follow-ups

- `system_extract` is not governed by this policy yet. Add an `extract` action only after auditing which extraction paths mutate durable state.
- Publish/status-specific policy is not separate yet. Current status/publish-like field changes are covered by `update`; add a `publish` action only if a distinct workflow needs it.
- Full runtime users, roles, and identity linking remain in `multi-user.md`.
