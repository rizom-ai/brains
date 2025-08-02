# Error Handling Simplification Plan

## Current State
The codebase uses a complex `BrainsError` base class from `@brains/utils` that provides:
- Error codes
- Normalized error causes
- Timestamps
- JSON serialization
- Complex inheritance hierarchy

## Problems
1. **Unnecessary complexity** - Most errors don't need codes, timestamps, or JSON serialization
2. **Package dependencies** - Forces packages to depend on @brains/utils just for errors
3. **Over-engineering** - Simple error scenarios become verbose
4. **Normalization overhead** - The `normalizeError` function adds complexity without clear benefit

## Proposed Solution
Use the simple pattern demonstrated in git-sync plugin:

```typescript
// Base error for a package/plugin
export class MyPackageError extends Error {
  constructor(
    message: string,
    public readonly context?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "MyPackageError";
  }
}

// Specific error types
export class SpecificError extends MyPackageError {
  constructor(
    message: string,
    context?: Record<string, unknown>,
  ) {
    super(message, context);
    this.name = "SpecificError";
  }
}
```

## Benefits
1. **No external dependencies** - Each package defines its own errors
2. **Simple and clear** - Just message and optional context
3. **Standard JavaScript** - Works with all error handling patterns
4. **Debugging-friendly** - Context provides necessary debugging info without overhead

## Migration Strategy

### Phase 1: Create Package-Local Error Classes
For each package that uses BrainsError:
1. Create local error base class extending Error
2. Add optional context for debugging
3. Update error subclasses to use local base

### Phase 2: Update Error Throws
1. Remove `normalizeError` calls
2. Pass error objects directly in context when needed
3. Simplify error constructor calls

### Phase 3: Remove Dependencies
1. Remove `@brains/utils` dependency where only used for errors
2. Update imports to use local error classes

### Phase 4: Clean Up
1. Mark BrainsError as deprecated in @brains/utils
2. Eventually remove BrainsError and related utilities

## Implementation Order

1. **Plugin packages** (lowest risk):
   - directory-sync ✓ (already done in git-sync)
   - site-builder
   
2. **Shell services** (medium risk):
   - view-registry
   - ai-service
   - messaging-service
   - entity-service
   - embedding-service

3. **Core packages** (highest risk):
   - @brains/plugins
   - @brains/plugin-utils
   - @brains/utils (mark as deprecated)

## Example Migration

### Before:
```typescript
import { BrainsError, normalizeError } from "@brains/utils";

export class ServiceError extends BrainsError {
  constructor(
    message: string,
    cause: unknown,
    context?: Record<string, unknown>,
  ) {
    super(message, "SERVICE_ERROR", normalizeError(cause), context ?? {});
  }
}

// Usage
throw new ServiceError("Operation failed", error, { operation: "update" });
```

### After:
```typescript
export class ServiceError extends Error {
  constructor(
    message: string,
    public readonly context?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "ServiceError";
  }
}

// Usage
throw new ServiceError("Operation failed", { operation: "update", error });
```

## Considerations

### When to Keep Complex Errors
Some scenarios might benefit from structured errors:
- HTTP/API responses that need error codes
- Errors that cross system boundaries
- Errors that need special serialization

For these cases, packages can implement their own specialized error classes without forcing the complexity on the entire codebase.

### Logging Integration
Loggers can still extract context from errors:
```typescript
logger.error(error.message, error.context);
```

## Success Criteria
1. No package depends on @brains/utils solely for error handling
2. Error handling code is simpler and more readable
3. Each package owns its error definitions
4. Debugging information is preserved through context