# @brains/content-pipeline

Manages entity publishing queues, scheduling, and generation.

## Features

- **Durable Queue Management**: Add, remove, reorder, and recover publication intent across restarts
- **Cron Scheduling**: Schedule publishing at specific times per entity type
- **Supervised Cycles**: Skip overlapping firings and drain active work during shutdown
- **Generation Scheduling**: Trigger automatic draft creation on schedule
- **Failure Recovery**: Track failed publications and let operators explicitly retry them
- **Provider Registry**: Register custom publish providers per entity type
- **Optional Studio Workspace**: Expose queue controls and confirmed direct publishing when `@brains/studio` is installed
- **Dashboard Digest**: Report compact, read-only pipeline health when `@brains/dashboard` is installed

## Composition

Content-pipeline is a declarative service. The canonical brain composes it as
the `content-pipeline` capability, under the plugin id `content-pipeline`; a
brain configures it in `brain.yaml` under `plugins.content-pipeline`:

```yaml
plugins:
  content-pipeline:
    entitySchedules:
      social-post: "0 9 * * 1-5" # Weekdays at 9am
    generationSchedules:
      newsletter: "0 8 * * 5" # Fridays at 8am
```

The package default-exports the definition; `createContentPipelinePackage({ onSetup })`
hands a test the services it builds.

Schedules use standard five-field cron syntax (`minute hour day month weekday`);
seconds fields are not supported.

## Operator surfaces

When Studio and content-pipeline are both installed, Studio automatically adds an
**Operations → Publishing** workspace. Operators can reorder or remove queued
items, retry failures, open source entities, and publish the current saved
version after an explicit confirmation. Studio remains unchanged when the pipeline
is absent.

The Dashboard widget is read-only. It shows queued, generating, awaiting-review,
and published totals, plus current failures. An **Open in Studio** action appears
only when Studio registration succeeded.

Queue membership is durable entity lifecycle state. Recoverable queue ordering
and enqueue metadata live in the namespaced runtime-state store, so reordering
does not rewrite Markdown or create Git noise.

## Tools

- `publishing_manage` - Manage publishing actions:
  - `queue-list` - list queued entities
  - `queue-add` - add an entity to the publish queue
  - `queue-remove` - remove an entity from the publish queue
  - `queue-reorder` - change an entity's queue position
  - `publish` - publish directly with confirmation and a content-hash precondition

Generated publish assets are reconciled automatically during publishing and are not exposed as an agent/MCP tool.

## Messages

- `publish:register` - Register a publish provider
- `generate:execute` - Trigger draft generation
