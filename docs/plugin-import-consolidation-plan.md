# Plugin Import Consolidation Plan with Type Reorganization

## Current Situation Analysis

After analyzing the plugin packages and their dependencies, I've identified opportunities to better organize types while consolidating imports:

### Plugin Packages to Update:

1. **@brains/core-plugin**
2. **@brains/service-plugin**
3. **@brains/interface-plugin**
4. **@brains/message-interface-plugin**

### Type Reorganization Opportunities:

#### 1. **IShell** - Keep in @brains/types

- Used by both plugins and core shell implementation
- Represents the core contract between shell and plugins
- Already in the right place

#### 2. **BaseEntity & EntityAdapter** - Move to @brains/entity-service

- These are entity-specific types that logically belong with the entity service
- Currently in @brains/types but primarily used for entity operations
- Moving them would make the entity service self-contained

#### 3. **Template & TemplateDataContext** - Move to @brains/content-generator

- Templates are primarily about content generation
- Currently in @brains/types but logically belong with content generation
- Would make content-generator the source of truth for templates

#### 4. **MessageContext** - Move to @brains/messaging-service or create @brains/message-types

- Currently in @brains/types/interfaces.ts
- Used by message-based interfaces
- Could be part of messaging-service or a dedicated message types package

#### 5. **DefaultQueryResponse** - Keep in @brains/types

- This is a cross-cutting response type used by multiple services
- Makes sense to keep in the central types package

## Implementation Plan

### Phase 1: Type Reorganization

#### Step 1.1: Move BaseEntity & EntityAdapter to @brains/entity-service

1. Move `BaseEntity`, `EntityInput`, `SearchResult`, and `EntityAdapter` from @brains/types to @brains/entity-service
2. Move `BaseEntityFormatter` to @brains/entity-service as well
3. Update @brains/types to re-export these from @brains/entity-service (temporary for backward compatibility)
4. Update all direct imports

#### Step 1.2: Move Template types to @brains/content-generator

1. Move `Template`, `TemplateDataContext`, `TemplateSchema` from @brains/types to @brains/content-generator
2. Update @brains/types to re-export these (temporary)
3. Update all direct imports

#### Step 1.3: Move MessageContext to @brains/messaging-service

1. Move `MessageContext` from @brains/types to @brains/messaging-service
2. Update @brains/types to re-export (temporary)
3. Update all direct imports

### Phase 2: Create Plugin Type Exports in @brains/plugins

After reorganization, @brains/plugins will export:

```typescript
// From @brains/types (keep as is)
export type { IShell, DefaultQueryResponse } from "@brains/types";

// From @brains/entity-service (after move)
export type {
  BaseEntity,
  EntityAdapter,
  EntityInput,
  SearchResult,
  IEntityService,
  ICoreEntityService,
} from "@brains/entity-service";
export { BaseEntityFormatter, baseEntitySchema } from "@brains/entity-service";

// From @brains/content-generator (after move)
export type {
  Template,
  TemplateDataContext,
  ContentGenerationConfig,
} from "@brains/content-generator";
export { TemplateSchema } from "@brains/content-generator";

// From @brains/messaging-service (after move)
export type {
  MessageContext,
  MessageHandler,
  MessageSender,
  IMessageBus,
} from "@brains/messaging-service";

// From other packages
export type { Logger } from "@brains/utils";
export type {
  JobHandler,
  BatchJobManager,
  BatchOperation,
  BatchJobStatus,
  Batch,
  JobProgressEvent,
} from "@brains/job-queue";
// ... etc
```

### Phase 3: Update Plugin Packages (one at a time)

#### Step 3.1: Update @brains/core-plugin

- Replace all imports from various @brains packages with imports from @brains/plugins
- Update package.json dependencies

#### Step 3.2: Update @brains/service-plugin

- Replace all imports with @brains/plugins
- Update package.json

#### Step 3.3: Update @brains/interface-plugin

- Replace all imports with @brains/plugins
- Update package.json

#### Step 3.4: Update @brains/message-interface-plugin

- Replace all imports with @brains/plugins
- Update package.json

### Phase 4: Export Plugin Classes from @brains/plugins

Add exports for all plugin base classes:

```typescript
export { CorePlugin } from "@brains/core-plugin";
export { ServicePlugin } from "@brains/service-plugin";
export { InterfacePlugin } from "@brains/interface-plugin";
export { MessageInterfacePlugin } from "@brains/message-interface-plugin";
// Also export contexts and test harnesses
```

### Phase 5: Cleanup

1. Remove temporary re-exports from @brains/types
2. Update any remaining direct imports

## Benefits of This Approach

1. **Better Type Organization**: Types are located with their primary domain
2. **Self-Contained Packages**: entity-service, content-generator, and messaging-service become more self-contained
3. **Single Import Source**: Plugin developers only need to import from @brains/plugins
4. **Clearer Architecture**: Types are organized by their domain rather than in a catch-all types package
5. **Easier Maintenance**: Changes to entity or template types only affect their respective packages

## Order of Implementation

1. Move entity types to @brains/entity-service
2. Move template types to @brains/content-generator
3. Move message context to @brains/messaging-service
4. Create consolidated exports in @brains/plugins
5. Update each plugin package one at a time
6. Add plugin class exports to @brains/plugins
7. Clean up temporary re-exports

This approach improves the architecture while achieving the goal of consolidating plugin imports.

## Current Import Analysis

### @brains/core-plugin imports:

- **From @brains/plugins**: BasePlugin, PluginCapabilities, PluginInitializationError, PluginContextError
- **From @brains/utils**: Logger
- **From @brains/types**: IShell, Template
- **From @brains/messaging-service**: MessageHandler, MessageSender
- **From @brains/entity-service**: ICoreEntityService (for context creation)

### @brains/service-plugin imports:

- **From @brains/core-plugin**: CorePluginContext, createCorePluginContext
- **From @brains/plugins**: BasePlugin, PluginCapabilities, ContentGenerationConfig
- **From @brains/types**: IShell, BaseEntity, EntityAdapter
- **From @brains/entity-service**: IEntityService
- **From @brains/job-queue**: JobHandler, BatchJobManager, BatchOperation, BatchJobStatus, Batch
- **From @brains/db**: JobOptions, JobQueue
- **From @brains/view-registry**: RouteDefinition, ViewTemplate

### @brains/interface-plugin imports:

- **From @brains/core-plugin**: CorePluginContext, createCorePluginContext
- **From @brains/plugins**: BasePlugin, Daemon, PluginCapabilities
- **From @brains/types**: IShell, DefaultQueryResponse
- **From @brains/command-registry**: CommandInfo, CommandResponse, CommandContext
- **From @brains/db**: JobQueue
- **From @brains/job-queue**: Batch, BatchJobStatus, BatchJobManager
- **From @brains/daemon-registry**: DaemonRegistry

### @brains/message-interface-plugin imports:

- **From @brains/interface-plugin**: InterfacePlugin, InterfacePluginContext (via MessageInterfacePluginContext alias)
- **From @brains/plugins**: PluginInitializationError
- **From @brains/job-queue**: JobProgressEvent
- **From @brains/db**: JobContext
- **From @brains/types**: MessageContext
- **From @brains/command-registry**: CommandResponse schema
