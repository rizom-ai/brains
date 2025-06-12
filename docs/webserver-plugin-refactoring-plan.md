# Webserver Plugin Refactoring Plan

## Overview

This document outlines a phased approach to refactoring the webserver plugin to remove its direct dependency on shell internals. The plan includes an immediate fix (Phase 0) followed by an evaluation of two architectural approaches for the long-term solution.

## Current Problem

The webserver plugin directly imports from shell internals:

```typescript
import type { EntityService } from "@brains/shell/src/entity/entityService";
import type { ContentTypeRegistry } from "@brains/shell/src/content";
```

This violates plugin architecture principles and creates tight coupling.

## Phased Approach

### Phase 0: Remove Shell Dependency (Immediate)

**Goal**: Remove direct imports from shell by having the Shell expose integration methods for plugins.

**Approach**: Follow the existing pattern where Shell provides getter methods, and make these available to plugins through the PluginContext.

#### Implementation Steps

1. **Move interfaces to @brains/types**

   - Ensure `EntityService` interface is in types (already exists)
   - Add `ContentTypeRegistry` interface to types package
   - Export from types/index.ts

2. **Add integration method to Shell**

   ```typescript
   // In packages/shell/src/shell.ts
   export class Shell {
     // ... existing methods ...

     public getContentTypeRegistry(): ContentTypeRegistry {
       return this.contentTypeRegistry;
     }

     // EntityService getter already exists:
     // public getEntityService(): EntityService
   }
   ```

3. **Update PluginContext interface**

   ```typescript
   // In packages/types/src/plugin.ts
   export interface PluginContext {
     // ... existing fields ...

     // Integration methods from Shell
     entityService: EntityService;
     contentTypeRegistry: ContentTypeRegistry;
   }
   ```

4. **Update PluginManager to provide services**

   ```typescript
   // In packages/shell/src/plugins/pluginManager.ts
   private createPluginContext(pluginId: string): PluginContext {
     const shell = this.registry.resolve<Shell>("shell");

     return {
       // ... existing context ...

       // Provide Shell's integration methods
       entityService: shell.getEntityService(),
       contentTypeRegistry: shell.getContentTypeRegistry(),
     };
   }
   ```

5. **Update webserver plugin to use context**

   ```typescript
   // In entity-resolver.ts
   export class EntityResolver {
     constructor(
       private entityService: EntityService,
       private contentTypeRegistry: ContentTypeRegistry
     ) {}
   }

   // In plugin registration
   async register(context: PluginContext): Promise<PluginCapabilities> {
     const { entityService, contentTypeRegistry } = context;

     // Pass services to components that need them
     const entityResolver = new EntityResolver(
       entityService,
       contentTypeRegistry
     );
   }
   ```

6. **Update package.json**
   - Remove `@brains/shell` from dependencies
   - Ensure `@brains/types` is in dependencies

#### Benefits of Phase 0

- Follows existing Shell patterns (getters for integration)
- Clean plugin interface through context
- No direct registry usage in plugins
- Maintains type safety
- Sets foundation for future patterns

### Phase 1: Evaluate Architectural Approaches

After Phase 0 is complete, evaluate two approaches for the long-term architecture:

## Approach 1: Content Composition API

**Concept**: Introduce a higher-level API that provides controlled access to cross-cutting operations.

### Design

```typescript
interface ContentCompositionAPI {
  queryEntities(options: QueryOptions): Promise<BaseEntity[]>;
  getEntity(entityType: string, id: string): Promise<BaseEntity | null>;
  parseContent(contentType: string, content: string): unknown;
  formatContent(contentType: string, data: unknown): string;
  getStatistics(): Promise<Statistics>;
}

interface PluginContext {
  // ... existing fields ...
  composition: ContentCompositionAPI;
}
```

### Pros

- Clean abstraction layer
- Hides internal services from plugins
- Easy to mock for testing
- Can add features (caching, permissions) transparently

### Cons

- New API to design and maintain
- Another layer of indirection
- May not fit all use cases

## Approach 2: Event-Based Composition

**Concept**: Use the existing MessageBus for cross-plugin data access through events.

### Design

```typescript
// Plugin requests data through events
const response = await messageBus.request("entity.query", {
  entityTypes: ["note", "task"],
  limit: 10,
  sortBy: "updated",
});

// Shell or other plugins handle the events
messageBus.handle("entity.query", async (message) => {
  const entities = await entityService.query(message.payload);
  return { entities };
});
```

### Implementation Using Existing Infrastructure

We already have:

- `MessageBus` with request/response pattern
- Event emitters in PluginContext
- Message handlers in plugins

### Example Implementation

```typescript
// Webserver plugin
export class ContentGenerator {
  constructor(
    private messageBus: MessageBus,
    private events: EventEmitter,
  ) {}

  async generateDashboard() {
    // Request entities through message bus
    const response = await this.messageBus.request("entities.list", {
      entityTypes: ["all"],
      limit: 100,
    });

    // Listen for entity updates
    this.events.on("entity.created", this.handleEntityUpdate);
    this.events.on("entity.updated", this.handleEntityUpdate);
  }
}

// Shell registers handlers
messageBus.handle("entities.list", async (message) => {
  const { entityTypes, limit } = message.payload;
  const entities = await entityService.listEntities(entityTypes, { limit });
  return { entities };
});
```

### Pros

- Uses existing infrastructure (MessageBus, EventEmitter)
- Loose coupling between plugins
- Natural async patterns
- Plugins can subscribe to changes
- Already follows established patterns in codebase

### Cons

- Less discoverable than direct API
- Async complexity for simple operations
- Need to define message schemas
- Potential performance overhead

## Phase 2: Implementation Decision

After Phase 0 completion, we will:

1. **Prototype both approaches** with a simple use case
2. **Evaluate based on**:

   - Code clarity and maintainability
   - Performance characteristics
   - Developer experience
   - Consistency with existing patterns
   - Extensibility for future needs

3. **Consider hybrid approach**:
   - Use Composition API for synchronous queries
   - Use Event-based for subscriptions and updates

## Implementation Timeline

### Week 1: Phase 0

- Day 1-2: Update types package with interfaces
- Day 3: Add Shell integration methods
- Day 4: Update PluginContext and PluginManager
- Day 5: Refactor webserver plugin and test

### Week 2: Phase 1 Evaluation

- Day 1-2: Prototype Composition API
- Day 3-4: Prototype Event-based approach
- Day 5: Document findings and recommendation

### Week 3: Implementation

- Implement chosen approach
- Migrate webserver plugin
- Update documentation

## Success Criteria for Phase 0

1. ✅ No imports from `@brains/shell/src/*` in webserver plugin
2. ✅ All existing tests pass
3. ✅ Plugin functionality unchanged
4. ✅ Type checking passes
5. ✅ Services accessed through PluginContext
6. ✅ Shell provides clean integration methods

## Testing Strategy

### Phase 0 Testing

1. Unit tests for Shell integration methods
2. Unit tests for updated PluginManager
3. Integration tests for plugin functionality
4. Manual testing of website generation
5. Type checking across all packages

### Phase 1 Testing

1. Prototype testing for both approaches
2. Performance benchmarks
3. Developer experience evaluation

## Risk Mitigation

### Phase 0 Risks

- **Risk**: Breaking changes to PluginContext interface
- **Mitigation**: Add new fields without removing existing ones

- **Risk**: Circular dependencies in types
- **Mitigation**: Careful interface design, minimal cross-references

### Phase 1 Risks

- **Risk**: Chosen approach doesn't scale
- **Mitigation**: Prototype with realistic use cases, consider hybrid approach

## Implementation Checklist for Phase 0

- [ ] Add `ContentTypeRegistry` interface to @brains/types
- [ ] Export new interface from types/index.ts
- [ ] Add `getContentTypeRegistry()` method to Shell
- [ ] Update PluginContext interface in types
- [ ] Update PluginManager to provide services in context
- [ ] Remove shell imports from webserver plugin
- [ ] Update webserver plugin to use context services
- [ ] Update webserver plugin package.json
- [ ] Run type checking
- [ ] Run all tests
- [ ] Manual testing of webserver functionality

## Next Steps

1. **Immediate**: Begin Phase 0 implementation
2. **After Phase 0**: Create prototypes for evaluation
3. **Decision Point**: Choose architectural approach based on evidence
4. **Long-term**: Implement chosen solution and migrate plugins

## Appendix: Pattern Comparison

### Current (Problematic) Pattern

```typescript
// Direct import - tight coupling
import type { EntityService } from "@brains/shell/src/entity/entityService";
```

### Phase 0 Pattern

```typescript
// Clean access through context
export function myPlugin(): Plugin {
  return {
    async register(context: PluginContext) {
      const { entityService, contentTypeRegistry } = context;
      // Use services...
    },
  };
}
```

### Future Pattern (TBD)

Either Composition API or Event-based, to be determined after evaluation.
