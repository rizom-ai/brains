# Singleton Pattern Refactor Plan

## Goal
Eliminate ~2400 lines of duplicate singleton boilerplate code across 24+ service classes by introducing a reusable base class, while maintaining backward compatibility.

## Approach: Iterative Refactoring

### Phase 1: Create Base Class and Test with One Service
**Goal**: Prove the concept works without breaking anything

1. Create `SingletonBase` abstract class in `shell/core/src/utils/`
2. Refactor ONE service (TemplateRegistry) to use it
3. Run all tests to ensure nothing breaks
4. Verify the public API remains identical
5. Commit if successful

### Phase 2: Refactor Core Services (Low Risk)
**Goal**: Apply pattern to core shell services

Services to refactor (5 services):
- [ ] ServiceRegistry
- [ ] CommandRegistry  
- [ ] DaemonRegistry
- [ ] JobProgressMonitor
- [ ] Logger

### Phase 3: Refactor Data Services (Medium Risk)
**Goal**: Apply to services with database connections

Services to refactor (6 services):
- [ ] EntityService
- [ ] ConversationService
- [ ] JobQueueService
- [ ] ContentService
- [ ] AIService
- [ ] EmbeddingService

### Phase 4: Refactor Complex Services (Higher Risk)
**Goal**: Apply to services with complex initialization

Services to refactor (remaining ~13 services):
- [ ] Shell
- [ ] ShellInitializer
- [ ] PluginManager
- [ ] MessageBus
- [ ] MCPService
- [ ] DataSourceRegistry
- [ ] RenderService
- [ ] RouteRegistry
- [ ] PermissionService
- [ ] Others...

## Design Decisions

### The Base Class Design

```typescript
export abstract class SingletonBase<T> {
  private static instances = new Map<string, any>();
  
  protected static getSingletonKey(): string {
    return this.name; // Use class name as key
  }
  
  public static getInstance<T>(this: new (...args: any[]) => T, ...args: any[]): T {
    const key = this.getSingletonKey();
    if (!SingletonBase.instances.has(key)) {
      SingletonBase.instances.set(key, new this(...args));
    }
    return SingletonBase.instances.get(key);
  }
  
  public static resetInstance(): void {
    const key = this.getSingletonKey();
    SingletonBase.instances.delete(key);
  }
  
  public static createFresh<T>(this: new (...args: any[]) => T, ...args: any[]): T {
    return new this(...args);
  }
}
```

### Handling Constructor Parameters

The challenge: Each service has different constructor parameters.

**Solution**: Use TypeScript's `this` parameter to preserve type safety:
- The static methods use `this: new (...args: any[]) => T` 
- This preserves the constructor signature of the derived class
- Calling code remains unchanged and type-safe

## Success Criteria

1. **No Breaking Changes**: All existing code continues to work
2. **Type Safety**: Full TypeScript type checking maintained
3. **Test Coverage**: All existing tests pass without modification
4. **Code Reduction**: ~2400 lines removed (100 lines per service × 24 services)

## Risks and Mitigations

| Risk | Mitigation |
|------|------------|
| Breaking existing code | Test after each service refactor |
| Type safety issues | Use TypeScript strict mode, run typecheck |
| Runtime singleton behavior changes | Extensive testing at each phase |
| Circular dependencies | Refactor one service at a time |

## Rollback Plan

If issues arise:
1. Git revert the specific service refactor
2. The base class can remain as it doesn't affect non-refactored services
3. Each service is refactored in isolation

## Estimated Timeline

- Phase 1: 30 minutes (create base + 1 service)
- Phase 2: 1 hour (5 simple services)
- Phase 3: 1.5 hours (6 data services)
- Phase 4: 2 hours (remaining complex services)

Total: ~5 hours of careful refactoring

## Alternative Considered

We considered a central SingletonManager (Option 4) but rejected it because:
- Would require changing hundreds of usage sites
- Less discoverable than class static methods
- More disruptive to existing code

## Next Steps

1. Review and approve this plan
2. Create the SingletonBase class
3. Test with TemplateRegistry as proof of concept
4. Proceed iteratively through phases if successful