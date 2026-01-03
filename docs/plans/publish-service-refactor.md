# Plan: Convert Publish-Pipeline to Core Service

> **Status: PLANNED** - Ready for implementation

## Overview

Convert `publish-pipeline` from a plugin to a core shell service (`shell/publish-service`), with tools exposed through the `system` plugin. This makes publish functionality always available without requiring a plugin dependency.

## Current State

- `plugins/publish-pipeline/` - ServicePlugin with QueueManager, ProviderRegistry, RetryTracker, Scheduler
- `plugins/blog/` - Has own `publish.ts` tool, registers with publish-pipeline via messages
- `plugins/decks/` - Has own `publish.ts` tool, registers with publish-pipeline via messages
- `plugins/social-media/` - Registers LinkedIn provider, handles `publish:execute` messages

## Target State

```
shell/
  publish-service/
    src/
      index.ts              # Exports
      publish-service.ts    # Main service (singleton)
      queue-manager.ts      # Queue management
      provider-registry.ts  # Provider lookup
      retry-tracker.ts      # Retry logic
      scheduler.ts          # Background processing
      types.ts              # Types and interfaces

plugins/
  system/
    src/
      tools/
        publish.ts          # system_publish tool
        queue.ts            # system_queue tool
```

## Architecture Decision

**Why shell service (not just "core plugin")?**

1. Publishing is as fundamental as entity CRUD - it belongs alongside entity-service
2. Consistent with how other core functionality is organized
3. System plugin already provides the "core tools" interface
4. No plugin ordering/dependency concerns
5. Cleaner separation: service = logic, plugin = tools/UI

## Implementation Phases

### Phase 1: Create shell/publish-service

1. Create `shell/publish-service/` directory structure
2. Move core components from publish-pipeline:
   - `queue-manager.ts` - as-is (already follows singleton pattern)
   - `provider-registry.ts` - as-is
   - `retry-tracker.ts` - as-is
   - `scheduler.ts` - adapt to work without message bus dependency
3. Create `publish-service.ts` - main service facade with:
   - `publish(entityType, entityId)` - direct publish
   - `queue(entityType, entityId)` - add to queue
   - `dequeue(entityType, entityId)` - remove from queue
   - `reorder(entityType, entityId, position)` - reorder
   - `listQueue(entityType?)` - list queued items
   - `registerProvider(entityType, provider)` - register external provider
   - `start()` / `stop()` - scheduler control
4. Add to `shell/plugins/src/service/context.ts`:
   - `publishService: IPublishService` - expose via context
5. Move types to `@brains/utils` or keep in service
6. Update `shell/core/src/shell.ts` to initialize PublishService

### Phase 2: Add tools to system plugin

1. Create `plugins/system/src/tools/publish.ts`:
   - `system_publish` - publish entity (immediate or queued)
   - Input: `{ entityType, id?, slug?, queue?: boolean }`
   - `queue: false` (default) = immediate publish
   - `queue: true` = add to publish queue
   - Uses context.publishService.publish() or queue()

2. Create `plugins/system/src/tools/queue.ts`:
   - `system_queue` - manage publish queue
   - Input: `{ action: 'list' | 'remove' | 'reorder', entityType?, entityId?, position? }`
   - `list` - show queued items (optionally filter by entityType)
   - `remove` - remove item from queue (requires entityType + entityId)
   - `reorder` - change position in queue (requires entityType + entityId + position)
   - Uses context.publishService queue methods

3. Update `plugins/system/src/tools/index.ts` to include new tools

### Phase 3: Remove publish tools from blog/decks

1. Delete `plugins/blog/src/tools/publish.ts`
2. Update `plugins/blog/src/plugin.ts`:
   - Remove `registerWithPublishPipeline()`
   - Remove `subscribeToPublishExecute()`
   - Remove publish tool from getTools()
   - Keep entity registration, generation handler

3. Delete `plugins/decks/src/tools/publish.ts`
4. Update `plugins/decks/src/plugin.ts`:
   - Same changes as blog

### Phase 4: Update social-media plugin

1. Update `plugins/social-media/src/plugin.ts`:
   - Change from message-based registration to direct service call
   - `context.publishService.registerProvider('social-post', linkedInProvider)`
   - Keep `PublishExecuteHandler` pattern but wire differently

2. Update provider registration flow:
   - Service calls provider.publish() directly
   - Or emits `publish:execute` message for plugins to handle
   - Keep message-based approach for flexibility

### Phase 5: Delete publish-pipeline plugin

1. Delete `plugins/publish-pipeline/` directory
2. Remove from any brain configurations that include it
3. Update documentation

### Phase 6: Update tests

1. Create `shell/publish-service/test/` with migrated tests
2. Update system plugin tests for new tools
3. Update blog/decks tests (remove publish tool tests)
4. Update social-media tests for new registration

## Key Files to Modify

**Create:**

- `shell/publish-service/src/index.ts`
- `shell/publish-service/src/publish-service.ts`
- `shell/publish-service/src/queue-manager.ts`
- `shell/publish-service/src/provider-registry.ts`
- `shell/publish-service/src/retry-tracker.ts`
- `shell/publish-service/src/scheduler.ts`
- `shell/publish-service/src/types.ts`
- `shell/publish-service/package.json`
- `shell/publish-service/tsconfig.json`
- `plugins/system/src/tools/publish.ts`
- `plugins/system/src/tools/queue.ts`

**Modify:**

- `shell/plugins/src/service/context.ts` - add publishService
- `shell/plugins/src/service/types.ts` - add IPublishService
- `shell/core/src/shell.ts` - initialize PublishService
- `plugins/system/src/tools/index.ts` - add new tools
- `plugins/system/src/plugin.ts` - add publish methods
- `plugins/blog/src/plugin.ts` - remove publish registration
- `plugins/decks/src/plugin.ts` - remove publish registration
- `plugins/social-media/src/plugin.ts` - update registration

**Delete:**

- `plugins/publish-pipeline/` (entire directory)
- `plugins/blog/src/tools/publish.ts`
- `plugins/decks/src/tools/publish.ts`

## Provider Pattern Decision

**Internal publishing (blog, decks):**

- No provider needed - service directly updates entity status
- `publishService.publish('post', 'my-post-id')` updates metadata.status = 'published'

**External publishing (social-media):**

- Plugin registers provider: `publishService.registerProvider('social-post', linkedInProvider)`
- Service calls `provider.publish()` when processing queue
- Or service emits message for plugin to handle (keeps flexibility)

## Open Questions

1. Should scheduler be part of the service or separate?
   - **Recommendation:** Part of service, started/stopped via service methods
   - Shell calls `publishService.start()` during initialization

2. Keep message-based provider execution or switch to direct calls?
   - **Recommendation:** Keep message-based for external providers (flexibility)
   - Direct status update for internal publishing (no provider needed)

3. Where do PublishProvider/PublishResult types live?
   - **Recommendation:** Keep in `@brains/utils` (already moved there)

## Integration Pattern

```
shell/core/shell.ts:
  - private readonly publishService: IPublishService;
  - getPublishService(): IPublishService

shell/plugins/src/service/context.ts:
  - publishService: IPublishService (via shell.getPublishService())
  - Plugins can call context.publishService.publish(), queue(), etc.

plugins/system/plugin.ts:
  - Uses this.context.publishService for system_publish, system_queue tools

plugins/social-media/plugin.ts:
  - Registers provider: context.publishService.registerProvider('social-post', provider)
  - Subscribes to publish:execute for handling
```

## Risks

1. **Breaking change** - brains using publish-pipeline directly need migration
2. **Test coverage** - ensure all existing tests are migrated
3. **Social-media integration** - needs careful handling of provider registration

## Success Criteria

- [ ] `system_publish` tool works for all entity types
- [ ] `system_queue` tool manages publish queue
- [ ] Blog/decks publish via system tools
- [ ] Social-media provider registration works
- [ ] All existing tests pass (migrated)
- [ ] No publish-pipeline plugin references remain
