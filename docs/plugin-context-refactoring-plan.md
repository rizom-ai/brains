# PluginContext Refactoring Plan

## Overview & Goals

### Current Problems

The current `PluginContext` interface exposes too many internal services and provides multiple backdoor access patterns that allow plugins to bypass proper abstractions:

1. **Direct Service Access**: Plugins can access `entityService` and `viewRegistry` directly
2. **Registry Backdoor**: The `registry: Registry` exposure allows plugins to resolve any internal service
3. **Inter-Plugin Access**: `getPlugin()` allows plugins to access other plugin instances directly
4. **Message Bus Exposure**: Direct `messageBus` access bypasses proper event handling patterns

### Security & Maintainability Concerns

- **Tight Coupling**: Plugins become tightly coupled to internal service implementations
- **Security Risk**: Plugins can access sensitive internal systems they shouldn't touch
- **Maintenance Burden**: Changes to internal services can break plugins unexpectedly
- **Testing Complexity**: Hard to mock and test plugin interactions properly
- **Architecture Violations**: Plugins can bypass intended abstraction layers

### Goals

1. **Clean Interface**: Provide only the minimal set of capabilities plugins actually need
2. **Proper Abstraction**: All plugin interactions go through well-defined methods
3. **Security**: Prevent plugins from accessing internal systems inappropriately
4. **Future-Proof**: Make it safe to refactor internal services without breaking plugins
5. **Clear Contract**: Establish a clear, documented contract of what plugins can/cannot do

## Current PluginContext Analysis

### Currently Exposed (Problematic)

```typescript
export interface PluginContext {
  // PROBLEMATIC: Direct service access
  entityService: EntityService;           // Bypass abstraction
  viewRegistry: ViewRegistry;             // Used directly in preact-builder.ts:127
  registry: Registry;                     // Global service backdoor
  messageBus: MessageBus;                 // Direct message system access
  getPlugin: (id: string) => Plugin;     // Inter-plugin access

  // GOOD: Proper abstraction methods
  pluginId: string;
  logger: Logger;
  events: EventEmitter;
  registerEntityType: <T extends BaseEntity>(...) => void;
  generateContent: <T = unknown>(...) => Promise<T>;
  parseContent: <T = unknown>(...) => T;
  generateWithRoute: (...) => Promise<string>;
  registerTemplate: <T>(...) => void;
  registerTemplates: (...) => void;
  registerRoutes: (...) => void;
}
```

### Current Plugin Usage Patterns

#### ✅ Good Usage (Keep)

```typescript
// directory-sync/src/plugin.ts
context.registerTemplate("status", {...});
context.entityService; // Used through provided interface

// git-sync/src/plugin.ts
context.registerTemplate("status", {...});
```

#### ❌ Problematic Usage (Fix)

```typescript
// site-builder-plugin/src/preact-builder.ts:127
const template = context.viewRegistry.getViewTemplate(section.template);
// PROBLEM: Direct viewRegistry access bypasses abstraction

// Potential future problems:
// context.registry.resolve<SomeService>("serviceId");
// context.getPlugin("other-plugin").someMethod();
// context.messageBus.publish("raw-message", data);
```

## Detailed Refactoring Steps

### Step 1: Remove Direct Service Access

**Files to modify:**

- `packages/types/src/plugin.ts` - Remove from interface
- `packages/shell/src/plugins/pluginManager.ts` - Remove from context creation

**Changes:**

```typescript
// REMOVE these lines from PluginContext:
entityService: EntityService;
viewRegistry: ViewRegistry;
registry: Registry;
```

### Step 2: Add Proper Abstraction Methods

**Add to PluginContext:**

```typescript
// Replace direct viewRegistry access
getViewTemplate: (name: string) => ViewTemplate | undefined;
```

**Implementation in PluginManager:**

```typescript
getViewTemplate: (name: string) => {
  return shell.getViewRegistry().getViewTemplate(name);
};
```

### Step 3: Remove Inter-Plugin Access

**Remove from PluginContext:**

```typescript
getPlugin: (id: string) => Plugin | undefined;
```

**Rationale:** Plugins should not have direct access to other plugins. Inter-plugin communication should happen through:

- Events via the EventEmitter
- Shared data through the entity system
- Service-level coordination through the Shell

### Step 4: Clean Up Message Bus Access

**Remove from PluginContext:**

```typescript
messageBus: MessageBus;
```

**Analysis:** Current plugins don't appear to use messageBus directly. If needed in future:

- Add specific event methods: `emitPluginEvent()`, `subscribeToPluginEvent()`
- Keep it plugin-scoped, not global message bus access

### Step 5: Update Plugin Implementations

#### Fix preact-builder.ts

**File:** `packages/site-builder-plugin/src/preact-builder.ts`
**Line 127:**

```typescript
// OLD:
const template = context.viewRegistry.getViewTemplate(section.template);

// NEW:
const template = context.getViewTemplate(section.template);
```

#### Update BuildContext Interface

**File:** `packages/site-builder-plugin/src/static-site-builder.ts`
**Remove viewRegistry from BuildContext:**

```typescript
export interface BuildContext {
  routes: RouteDefinition[];
  // Remove: viewRegistry: ViewRegistry;
  // Access through context.getViewTemplate() instead
}
```

## Before/After Interface Comparison

### Before (Current - Problematic)

```typescript
export interface PluginContext {
  pluginId: string;
  registry: Registry;                     // ❌ Global backdoor
  logger: Logger;
  getPlugin: (id: string) => Plugin;     // ❌ Inter-plugin access
  events: EventEmitter;
  messageBus: MessageBus;                // ❌ Raw message access
  registerEntityType: <T extends BaseEntity>(...) => void;
  generateContent: <T = unknown>(...) => Promise<T>;
  parseContent: <T = unknown>(...) => T;
  generateWithRoute: (...) => Promise<string>;
  registerTemplate: <T>(...) => void;
  registerTemplates: (...) => void;
  registerRoutes: (...) => void;
  entityService: EntityService;          // ❌ Direct service access
  viewRegistry: ViewRegistry;            // ❌ Direct service access
}
```

### After (Proposed - Clean)

```typescript
export interface PluginContext {
  pluginId: string;
  logger: Logger;
  events: EventEmitter;                  // ✅ Plugin-scoped events

  // Entity management
  registerEntityType: <T extends BaseEntity>(...) => void;

  // Content generation (properly namespaced)
  generateContent: <T = unknown>(...) => Promise<T>;
  parseContent: <T = unknown>(...) => T;
  generateWithRoute: (...) => Promise<string>;

  // Template registration (unified)
  registerTemplate: <T>(...) => void;
  registerTemplates: (...) => void;

  // Route registration
  registerRoutes: (...) => void;

  // View template access (replaces direct viewRegistry access)
  getViewTemplate: (name: string) => ViewTemplate | undefined;
}
```

### Key Removals

- ❌ `registry: Registry` - No global service backdoor
- ❌ `entityService: EntityService` - Use provided methods instead
- ❌ `viewRegistry: ViewRegistry` - Use `getViewTemplate()` method
- ❌ `getPlugin: (id: string) => Plugin` - No inter-plugin access
- ❌ `messageBus: MessageBus` - Use EventEmitter for plugin events

## Impact Analysis

### Files Requiring Updates

#### Core Interface Files

1. **`packages/types/src/plugin.ts`**

   - Remove problematic properties from PluginContext interface
   - Add new `getViewTemplate` method

2. **`packages/shell/src/plugins/pluginManager.ts`**
   - Remove registry, entityService, viewRegistry from context creation
   - Remove getPlugin implementation
   - Add getViewTemplate implementation

#### Plugin Implementation Files

3. **`packages/site-builder-plugin/src/preact-builder.ts`**

   - Line 127: Replace `context.viewRegistry.getViewTemplate()` with `context.getViewTemplate()`

4. **`packages/site-builder-plugin/src/static-site-builder.ts`**

   - Remove `viewRegistry: ViewRegistry` from BuildContext interface
   - Update BuildContext creation in site-builder.ts

5. **`packages/site-builder-plugin/src/site-builder.ts`**
   - Update BuildContext creation to not pass viewRegistry
   - Pass context to preact-builder instead

#### Potential Additional Files

6. **`packages/site-builder-plugin/src/hydration/hydration-manager.ts`**
   - Check for any registry access usage

### Breaking Changes Assessment

- **Low Risk**: Most plugins use the proper abstraction methods already
- **Medium Risk**: Site-builder plugin needs updates for viewRegistry access
- **Zero Risk**: No plugins currently use `getPlugin()` or direct `messageBus`

### Migration Strategy

1. **Phase 1**: Add `getViewTemplate()` method to PluginContext (non-breaking)
2. **Phase 2**: Update site-builder to use new method (breaking for site-builder only)
3. **Phase 3**: Remove old properties from interface (breaking change)
4. **Phase 4**: Clean up any remaining references

## Implementation Plan

### Step 1: Add New Methods (Non-Breaking)

1. Add `getViewTemplate()` to PluginContext interface
2. Implement in PluginManager
3. Test that new method works correctly

### Step 2: Update Site-Builder Plugin

1. Update preact-builder.ts to use `getViewTemplate()`
2. Remove viewRegistry from BuildContext
3. Update site-builder.ts accordingly
4. Test site building still works

### Step 3: Remove Old Properties (Breaking)

1. Remove `registry`, `entityService`, `viewRegistry` from interface
2. Remove `getPlugin`, `messageBus` from interface
3. Update PluginManager to not provide these
4. Run all tests to ensure nothing breaks

### Step 4: Final Cleanup

1. Update any TypeScript compilation errors
2. Update documentation
3. Add comments explaining the clean interface

### Testing Strategy

- **Unit Tests**: Test PluginManager context creation
- **Integration Tests**: Test site-builder plugin still works
- **Manual Testing**: Run test-brain app and verify plugins work
- **Backwards Compatibility**: Ensure no existing functionality breaks

### Rollback Strategy

If issues arise:

1. **Step 1-2**: Easy rollback, just revert specific changes
2. **Step 3**: Temporarily add deprecated properties back with console warnings
3. **Step 4**: Full revert to previous interface if needed

## Security & Architecture Benefits

### Improved Plugin Isolation

- **Principle of Least Privilege**: Plugins only get access to what they need
- **No Backdoors**: Prevents plugins from accessing internal systems inappropriately
- **Clear Boundaries**: Well-defined interface makes plugin capabilities obvious

### Better Architecture

- **Loose Coupling**: Plugins depend on stable interfaces, not implementations
- **Testability**: Easier to mock plugin interactions for testing
- **Maintainability**: Can refactor internal services without breaking plugins
- **Documentation**: Clear contract of what plugins can/cannot do

### Future-Proofing

- **Service Evolution**: Internal services can change without plugin impact
- **Security Auditing**: Easier to audit what plugins have access to
- **Plugin Development**: Clearer guidelines for plugin developers
- **System Stability**: Reduced risk of plugins breaking the core system

## Success Criteria

### Functional Requirements

- ✅ All existing plugins continue to work
- ✅ Site building functionality is preserved
- ✅ Template registration and usage works correctly
- ✅ Entity management continues to function

### Non-Functional Requirements

- ✅ No backdoor access to internal services
- ✅ Clear, minimal plugin interface
- ✅ Good error messages if plugins try to access removed properties
- ✅ Comprehensive documentation of the new interface

### Verification Steps

1. Run full test suite - all tests pass
2. Test site building in test-brain app
3. Verify all plugins load and register correctly
4. Check that removed properties are truly inaccessible
5. Confirm no TypeScript compilation errors
