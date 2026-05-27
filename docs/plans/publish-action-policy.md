# Plan: Publish Action Policy

## Status

Proposed follow-up to the now-shipped central entity action policy.

## Problem

Entity action policy now separates durable mutations by action (`create`, `update`, `delete`, `extract`). That still leaves one important user-facing distinction unresolved: editing draft/internal content is not the same as committing content to a distribution path.

Today, publish-like behavior is spread across status updates and publish-pipeline/plugin tools. A generic `update` check is too coarse for long-term collaborator workflows: a teammate may be allowed to edit a draft but not queue, schedule, send, or publish it.

## Goal

Add a shared `publish` entity action for operations that cross a distribution or commitment boundary.

The policy layer should answer authorization. Publish-capable plugins and workflows should define which operations count as publishing.

## Non-goals

- Do not treat every `status` field change as publishing.
- Do not infer publish semantics globally from status names alone.
- Do not replace the existing publish pipeline plugin.
- Do not add full RBAC or per-field permissions.
- Do not implement this until there is a concrete publish workflow being wired end-to-end.

## Core model

`update` means editing entity content or internal metadata.

`publish` means moving an entity into an externally visible, externally distributed, or automation-committed state.

Examples requiring `publish`:

- queueing content for outbound distribution when the queue is execution-backed;
- scheduling content for publication;
- executing a publish/send action;
- marking content as published/sent/live through a publish-aware workflow;
- changing a publish-aware entity from a non-publish state into a publish state.

Examples that remain `update`:

- editing title/body/tags/summary;
- moving internal work from `new` to `planned`;
- changing review-only statuses such as `draft` to `needs-review`;
- changing status on entity types that do not declare publish semantics.

## Policy shape

Add `publish` to the existing entity action policy values:

```yaml
permissions:
  entityActions:
    "*":
      create: anchor
      update: anchor
      delete: anchor
      extract: anchor
      publish: anchor
```

Rules:

- Platform fallback is `publish: anchor`.
- Brain models may loosen `publish` only for explicitly safe entity types.
- Instance config may override `publish` like other entity actions.
- `publish` does not replace `update`; a publish operation may require both content validity and publish authorization, but the policy denial should name `publish` when publication is the blocked boundary.

## Publish semantics declaration

Publish-aware entity/plugin packages should declare publish semantics explicitly. Do not infer from status names globally.

Candidate entity type config extension:

```ts
interface EntityTypeConfig {
  publish?: {
    statusField?: string; // default: "status"
    publishStatuses?: string[];
  };
}
```

Example declarations:

```ts
// blog/post
publish: {
  publishStatuses: ["published"],
}

// social-post
publish: {
  publishStatuses: ["queued", "scheduled", "published", "sent"],
}

// newsletter
publish: {
  publishStatuses: ["queued", "sent"],
}
```

Interpretation:

- `draft -> queued` requires `publish` only for entity types where `queued` is declared as a publish status.
- `draft -> queued` on a generic internal workflow entity remains `update` unless that entity declares publish semantics.

## Enforcement points

### `system_update`

When updating fields or replacing content:

1. resolve the existing entity;
2. compute the effective next metadata/status;
3. if the entity type declares publish semantics and the transition crosses from non-publish state into publish state, require `publish`;
4. otherwise require `update` as today.

Open detail: if an update both edits content and crosses the publish boundary, checking `publish` may be sufficient because it is stricter by default. If an instance loosens `publish` below `update`, the system should either check both or reject invalid policy ordering. Decide during implementation.

### Publish pipeline plugin

Publish pipeline tools should call the same central policy helper before operations such as:

- add to execution-backed queue;
- schedule;
- publish/send now;
- mark as published/sent;
- retry a publish execution.

Queue-only/internal review operations should remain `update` unless they commit the entity to publication automation.

### Plugin-specific publish tools

Any plugin-specific tool that publishes, sends, schedules, or transitions to a publish state must enforce `publish`. It should not rely on the generic `system_update` path unless it actually uses that path.

## Implementation steps

1. Add `publish` to `EntityActionSchema`, config parsing, type exports, labels, and tests.
2. Add platform fallback `publish: anchor`.
3. Extend entity type config with publish semantics declaration.
4. Add helper to detect publish-boundary transitions from old entity metadata to new metadata.
5. Enforce `publish` in `system_update` for declared publish-boundary transitions.
6. Update publish pipeline tools to call the central policy helper for publish/schedule/queue execution operations.
7. Add entity/plugin declarations for the first concrete publish-capable entity types being covered.
8. Add tests for:
   - policy parsing/merging with `publish`;
   - fallback `publish: anchor`;
   - non-publish status changes still requiring only `update`;
   - declared publish transition requiring `publish`;
   - `draft -> queued` requiring `publish` only for publish-aware entity types;
   - publish pipeline tool denial for caller below required level.
9. Update docs and eval cases for collaborator draft-edit vs owner publish behavior.

## Validation matrix

- trusted collaborator can edit a draft entity when `update: trusted`.
- trusted collaborator cannot publish/schedule/queue that entity when `publish: anchor`.
- anchor can publish/schedule/queue.
- status changes on non-publish-aware entities remain governed by `update`.
- publish-aware `draft -> queued` requires `publish`.
- non-publish-aware `draft -> queued` does not require `publish`.
- plugin publish tools and `system_update` produce consistent denials.

## Open decisions

1. Exact `EntityTypeConfig.publish` shape.
2. Whether publish-boundary updates require both `update` and `publish`, or only `publish`.
3. Which existing publish-pipeline operations are internal queue management vs publication commitment.
4. First entity/plugin slice to wire end-to-end.
