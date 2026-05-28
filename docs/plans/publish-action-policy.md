# Plan: Publish Action Policy

## Status

Proposed follow-up to the now-shipped central entity action policy.

## Problem

Entity action policy now separates durable mutations by action (`create`, `update`, `delete`, `extract`). That still leaves one important user-facing distinction unresolved: editing draft/internal content is not the same as committing content to a distribution path.

Today, publish-like behavior is spread across status updates and publish-pipeline tools (`plugins/content-pipeline/src/tools/publish.ts`, social-media/newsletter `publish:execute` handlers). A generic `update` check is too coarse for long-term collaborator workflows: a teammate may be allowed to edit a draft but not queue, schedule, send, or publish it.

## Goal

Add a shared `publish` entity action for operations that cross a distribution or commitment boundary.

The policy layer answers authorization. Publish-capable entity packages declare which states count as publishing.

## Non-goals

- Do not treat every `status` field change as publishing.
- Do not infer publish semantics globally from status names alone.
- Do not replace the existing publish pipeline plugin.
- Do not add full RBAC or per-field permissions.
- Do not implement this until there is a concrete publish workflow being wired end-to-end.

## Core model

`update` means editing entity content or internal metadata.

`publish` means moving an entity into an externally visible, externally distributed, or automation-committed state.

The boundary crossing is **the human commitment**, not the side-effect timing. Queueing content with a future `scheduledFor` is publishing — the human authorized the commitment; the timer firing is automation. Likewise, a `failed` status reached after a publish attempt is a publish state: the boundary was already crossed; retrying is automation, not a new commitment.

Examples requiring `publish`:

- queueing content for outbound distribution when the queue is execution-backed;
- scheduling content for publication (regardless of `scheduledFor` timing);
- executing a publish/send action;
- marking content as published/sent/live through a publish-aware workflow;
- changing a publish-aware entity from a non-publish state into a publish state;
- retrying a `failed` publish (still a publish state; not a new commitment, but the action must remain gated).

Examples that remain `update`:

- editing title/body/tags/summary on a draft;
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
- **Invariant: effective `publish` must be ≥ effective `update` for the same entity type.** Publishing implies updating; an operator who loosens `publish` below `update` has produced an inconsistent policy. Validate this after full policy merge/resolution, including wildcard inheritance and entity-specific overrides, and reject with a clear error naming the entity type. Permission order: `never > anchor > trusted > public`.
- Because of the invariant, `system_update` checks **only `publish`** when a transition crosses the publish boundary — `publish` automatically covers `update`. The denial message names `publish` when publication is the blocked boundary.

## Publish semantics declaration

Publish-aware entity packages declare publish semantics explicitly. Do not infer from status names globally.

`EntityTypeConfig` (in `shell/entity-service/src/types.ts`) is extended:

```ts
interface EntityTypeConfig {
  weight?: number;
  embeddable?: boolean;
  projectionSource?: boolean;
  publish?: {
    publishStatuses: string[];
  };
}
```

The `status` metadata field is the convention across all current publish-aware schemas (`blog-post`, `social-post`, `newsletter`). The plan treats `"status"` as the field name; no per-type field override is needed for the first slice. If a future entity type needs a different field, extend the config then — YAGNI.

Boundary detection compares `oldStatus ∈ publishStatuses` against `newStatus ∈ publishStatuses`. A transition crosses the boundary when `oldStatus` is NOT in `publishStatuses` and `newStatus` IS in `publishStatuses`. Transitions within the publish-state set (e.g. `queued → failed`, `failed → published`) do not cross the boundary again but **still require `publish`** because they manipulate publication state.

Plugin-declared `publishStatuses` is structural — it defines what publishing means for that entity. Instance config cannot redefine the boundary; operators only override the required permission level via `permissions.entityActions.{type}.publish`. This matches the existing entity-action separation: plugin owns semantics, operator owns authorization.

### Declarations for current publish-aware types

These match the actual status enums in the codebase as of this plan:

```ts
// entities/blog/src/schemas/blog-post.ts — entityType: "post", status: draft | queued | published
publish: {
  publishStatuses: ["queued", "published"];
}

// social-media/schemas/social-post.ts — status: draft | queued | published | failed
publish: {
  publishStatuses: ["queued", "published", "failed"];
}

// newsletter/schemas/newsletter.ts — status: draft | queued | published | failed
publish: {
  publishStatuses: ["queued", "published", "failed"];
}
```

`draft` is the only non-publish state in each — that's the editable surface for collaborators.

## Enforcement points

### `system_update`

When updating fields or replacing content:

1. resolve the existing entity;
2. compute the effective next metadata/status;
3. if the entity type declares publish semantics, check whether the transition crosses the publish boundary OR remains inside the publish-state set;
4. if either, require `publish` (single check — invariant guarantees this covers `update`);
5. otherwise require `update` as today.

### Shared policy API for plugins and entity packages

The current `assertEntityActionAllowed` helper lives in system-tool code. This plan requires a public runtime policy surface that entity and service plugins can call, for example:

```ts
context.permissions.assertEntityActionAllowed(
  entityType,
  "publish",
  toolContext,
);
```

Add this through both `EntityPluginContext` and `ServicePluginContext` (or an equivalent public service), not by importing shell/core internals from plugins. Keep `EntityTypeConfig.publish` available through the existing public import path (`@brains/plugins`) so entity packages do not import `@brains/entity-service` directly.

Enforce the boundary by extending the existing `no-restricted-imports` block in `shared/eslint-config/index.js`:

- cover `**/entities/**/*.ts` in addition to `**/plugins/**/*.ts` and `**/interfaces/**/*.ts`;
- add exact `paths` for restricted package roots such as `@brains/core`;
- add `patterns` for subpath imports such as `@brains/core/*` and any other shell-internal package/subpath that could expose policy helpers outside the plugin context surface.

### Caller context propagation

Publish operations must preserve the authorization context that created the commitment:

- direct tool calls use the caller's tool context;
- queued/scheduled work stores or forwards the original commitment context or an explicit internal authorization context;
- scheduler-triggered automation runs under an explicit internal/system authorization context and should be auditable as automation, not described as bypassing policy.

`content-pipeline` queue entries currently carry only `entityType`, `entityId`, `position`, and `queuedAt`; `publish:execute` payloads currently carry only `{ entityType, entityId }`. Implementation must extend both queue entries and publish execution messages/jobs with enough authorization metadata for handlers to distinguish user-triggered execution from scheduler automation.

### Publish pipeline and plugin handlers

All publish pipeline operations call the shared policy API before performing the operation. Operations that count as publication commitment:

- `content-pipeline_publish` tool — direct provider publish path and explicit commit.
- `content-pipeline_queue` with `action: "add"` for publish-aware entity types — queueing is the human commitment to publish.
- `publish:execute` handlers (social-media, newsletter) — message/scheduler publish path and actual send. Scheduler-invoked handlers execute under the explicit internal/system authorization context. Tool-invoked immediate publish checks the caller's level.
- Manual retry of a `failed` publish via tool — still gated, even though `failed → queued/published` does not cross the boundary again.

Queue operations that are not new publication commitments:

- `content-pipeline_queue` with `action: "list"` remains read-only.
- `content-pipeline_queue` with `action: "remove"` cancels a prior commitment; keep under `update` for the first slice unless product requirements demand a separate `unpublish`/`cancelPublish` action.
- `content-pipeline_queue` with `action: "reorder"` changes execution order but not whether the entity will publish; keep under `update` for the first slice unless scheduling policy later needs a separate action.

Operations that remain `update` (not new publish commitments):

- editing draft body/title/metadata;
- moving review-only statuses among non-publish states;
- scheduler retry after an already-authorized queued publish; this uses the stored/internal authorization context rather than asking the original user again;
- automation reporting `publish:report:success/failure` messages (these manipulate publish state as bookkeeping for completed work, but are authorized by the prior publish commitment/internal automation context rather than a new user commitment).

### Cross-entity publish workflows

Derived publish-aware entities (e.g. a `social-post` auto-generated from a published `post`) get their own publish gate evaluated against their own caller context. The source entity's permission check is not re-evaluated when the derived entity is published — each entity is its own subject.

When the derivation pipeline runs as automation, it executes under the explicit internal/system authorization context, so the check is auditable as automation. When a user manually triggers a derived publish, the check runs against that user's level for the derived entity type.

## Implementation steps

1. Add `publish` to `EntityActionSchema`, config parsing, type exports, labels, and tests.
2. Add platform fallback `publish: anchor` in `shell/app/src/brain-resolver.ts` `PLATFORM_ENTITY_ACTION_DEFAULTS`.
3. Add the effective `publish >= update` invariant check after entity action policy merge/resolution; reject inconsistent policies with a clear error.
4. Expose a shared entity-action policy assertion API through plugin context or an equivalent public service.
5. Extend `EntityTypeConfig` in `shell/entity-service/src/types.ts` with the `publish.publishStatuses` field.
6. Add a `crossesPublishBoundary(entityType, oldStatus, newStatus, registry)` helper that returns `boundary` | `within-publish-set` | `non-publish`. The helper drives whether `publish` is required.
7. Enforce `publish` in `system_update` based on the helper's result.
8. Extend queue and publish job/message metadata (`QueueEntry`, `publish:execute`, and scheduler metadata) to carry either caller tool context or explicit internal/system authorization context.
9. Wire the first end-to-end slice for **social-post** only: entity declaration, `system_update`, `content-pipeline_publish`, `content-pipeline_queue action=add`, social-media `publish:execute`, failed retry semantics, and deferred scheduler execution.
10. After social-post proves the helper/API shape, add blog post (`entityType: "post"`) and newsletter declarations/handlers using the same pattern.
11. Add tests for:
    - policy parsing/merging with `publish`;
    - fallback `publish: anchor`;
    - rejection of policies where effective `publish < update`, including wildcard + entity override combinations;
    - non-publish status changes still requiring only `update`;
    - declared publish-boundary transition requiring `publish`;
    - transitions within the publish-state set (`queued → failed`, `failed → published`) requiring `publish`;
    - `draft → queued` requiring `publish` only for publish-aware entity types;
    - manual `failed` retries still gated;
    - `content-pipeline_publish`, `content-pipeline_queue action=add`, and `publish:execute` handler denial for caller below required level;
    - `content-pipeline_queue action=remove/reorder` staying under `update` for the first slice;
    - scheduler-triggered publish using explicit internal/system authorization context;
    - lint enforces that `**/entities/**/*.ts`, `**/plugins/**/*.ts`, and `**/interfaces/**/*.ts` cannot import `@brains/core` or restricted shell internals for policy checks, including subpaths via `no-restricted-imports.patterns` — verified by an ESLint rule extension in `shared/eslint-config/index.js` and a CI lint pass.
12. Update docs and eval cases for collaborator draft-edit vs owner publish behavior.

## Validation matrix

- trusted collaborator can edit a draft entity when `update: trusted`.
- trusted collaborator cannot publish/schedule/queue that entity when `publish: anchor`.
- anchor can publish/schedule/queue.
- status changes on non-publish-aware entities remain governed by `update`.
- publish-aware `draft → queued` requires `publish`.
- publish-aware `queued → failed` requires `publish` (still inside publish-state set).
- publish-aware `failed → published` requires `publish` (retry path).
- non-publish-aware `draft → queued` does not require `publish`.
- plugin publish tools, `content-pipeline_queue action=add`, publish handlers, and `system_update` produce consistent denials.
- automation-triggered publish (`publish:execute` from scheduler) runs under explicit internal/system authorization context and is auditable as automation.
- a policy with effective `update: anchor, publish: trusted` is rejected after policy merge/resolution with a clear error.
- derived publish-aware entity (e.g. social-post from blog post) is gated by the derived type's policy, not the source type's.

## Closed decisions

The original "Open decisions" section is resolved:

1. **`EntityTypeConfig.publish` shape:** `{ publishStatuses: string[] }`. `statusField` dropped — `"status"` is the universal convention; revisit if a future entity diverges.
2. **Update + publish together:** enforce `publish ≥ update` as a validated invariant after full policy merge/resolution. For boundary-crossing or within-publish-state updates, check only `publish` — the invariant guarantees this covers `update`.
3. **Internal queue management vs publication commitment:** queueing is the commitment (the human authorized it). Automation timing (scheduler firing, scheduled execution, retry loops) is not a new commitment. Status updates triggered by completed automation (`publish:report:*`) are not commitments either.
4. **First entity slice:** social-post. Wire it end-to-end before generalizing. It has the richest workflow (`failed` retries, deferred execution, derived-from-source semantics), so getting it right validates the design for blog post and newsletter, which follow the same shape.
