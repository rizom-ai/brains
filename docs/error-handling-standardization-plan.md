# Error Handling Standardization Plan - Phase 2.2.3

## Overview

This document outlines the plan for standardizing error handling across all interfaces and plugins in the Personal Brain system. This is Phase 2.2.3 of the shell refactoring effort, building on the error handling standardization already completed in the shell package (Phase 2.2.1) and core service packages (Phase 2.2.2).

## Current State

### Completed Standardization

1. **Shell Package** ✅
   - Standardized error classes in `@brains/utils`
   - Base `BrainsError` class with consistent structure
   - Specialized error classes for different scenarios

2. **Core Service Packages** ✅
   - Service packages use standardized errors
   - Consistent error context and metadata

### Packages Requiring Standardization

#### Interfaces (4 packages)
1. **CLI Interface** (`@brains/cli`)
   - Currently uses generic `Error` throws
   - No custom error classes
   - Limited error context

2. **Matrix Interface** (`@brains/matrix`)
   - Mix of generic errors and some custom handling
   - Inconsistent error messages
   - No structured error context

3. **MCP Interface** (`@brains/mcp`)
   - Generic `Error` throws throughout
   - No error categorization
   - Missing operation context

4. **Webserver Interface** (`@brains/webserver`)
   - Basic error handling
   - No custom error classes

#### Plugins (3 packages)
1. **Directory Sync** (`@brains/directory-sync`)
   - ✅ Already has custom error classes extending `BrainsError`
   - Good example of proper implementation

2. **Git Sync** (`@brains/git-sync`)
   - Has custom error classes
   - Needs review for consistency

3. **Site Builder** (`@brains/site-builder`)
   - Has custom error classes
   - Complex plugin may need additional error types

## Standardization Goals

### 1. Consistent Error Hierarchy

```typescript
BrainsError (base)
├── InitializationError
├── ConfigurationError
├── ServiceError
├── InterfaceError (new)
│   ├── CLIError
│   ├── MatrixError
│   ├── MCPError
│   └── WebserverError
└── PluginError (existing)
    ├── DirectorySyncError (existing)
    ├── GitSyncError
    └── SiteBuilderError
```

### 2. Error Context Standards

Every error should include:
- **message**: Clear description of what went wrong
- **code**: Unique error code for categorization
- **cause**: The underlying error (if any)
- **context**: Relevant metadata (operation, inputs, state)
- **timestamp**: When the error occurred

### 3. Error Handling Patterns

```typescript
// Bad - Generic error with no context
throw new Error("Failed to process message");

// Good - Specific error with context
throw new MatrixMessageError(
  "Failed to process message",
  error,
  {
    roomId: event.room_id,
    eventType: event.type,
    userId: event.sender
  }
);
```

## Implementation Roadmap

### Phase 1: Interface Error Classes (2-3 days)

1. **Create Interface Error Base Classes**
   - Add `InterfaceError` to `@brains/utils`
   - Create interface-specific error classes

2. **Update Each Interface**
   - CLI: Replace all generic errors
   - Matrix: Standardize error handling
   - MCP: Add proper error context
   - Webserver: Implement error classes

### Phase 2: Plugin Error Review (1-2 days)

1. **Review Existing Plugin Errors**
   - Ensure consistency with `BrainsError`
   - Add missing error types
   - Standardize error codes

2. **Update Plugin Error Handling**
   - Git Sync: Align with standards
   - Site Builder: Add missing contexts

### Phase 3: Error Recovery Patterns (1 day)

1. **Implement Retry Logic**
   - For transient errors
   - With exponential backoff

2. **Error Reporting**
   - Consistent logging format
   - User-friendly error messages

## Implementation Details

### Interface Error Classes

#### CLI Interface Errors
```typescript
export class CLIError extends InterfaceError {
  constructor(message: string, cause: ErrorCause, context?: Record<string, unknown>) {
    super(message, "CLI_ERROR", cause, context);
  }
}

export class CLIInitializationError extends CLIError { /* ... */ }
export class CLIRenderError extends CLIError { /* ... */ }
export class CLICommandError extends CLIError { /* ... */ }
```

#### Matrix Interface Errors
```typescript
export class MatrixError extends InterfaceError {
  constructor(message: string, cause: ErrorCause, context?: Record<string, unknown>) {
    super(message, "MATRIX_ERROR", cause, context);
  }
}

export class MatrixConnectionError extends MatrixError { /* ... */ }
export class MatrixMessageError extends MatrixError { /* ... */ }
export class MatrixPermissionError extends MatrixError { /* ... */ }
```

#### MCP Interface Errors
```typescript
export class MCPError extends InterfaceError {
  constructor(message: string, cause: ErrorCause, context?: Record<string, unknown>) {
    super(message, "MCP_ERROR", cause, context);
  }
}

export class MCPToolError extends MCPError { /* ... */ }
export class MCPResourceError extends MCPError { /* ... */ }
export class MCPTransportError extends MCPError { /* ... */ }
```

### Error Context Examples

#### CLI Context
```typescript
{
  command: string,
  args: string[],
  sessionId: string,
  timestamp: Date
}
```

#### Matrix Context
```typescript
{
  roomId: string,
  eventId: string,
  userId: string,
  eventType: string,
  messageContent?: string
}
```

#### MCP Context
```typescript
{
  toolName: string,
  resourceUri: string,
  transport: "stdio" | "http",
  requestId: string
}
```

## Success Criteria

1. **No Generic Errors**: All `throw new Error()` replaced with specific error classes
2. **Consistent Context**: Every error includes relevant operational context
3. **Error Codes**: Unique, searchable error codes for all error types
4. **Test Coverage**: Error paths have unit tests
5. **Documentation**: Error types documented in each package

## Migration Strategy

1. **Incremental Updates**: Update one interface/plugin at a time
2. **Backward Compatibility**: Maintain error message formats for existing integrations
3. **Testing**: Add tests for new error scenarios
4. **Documentation**: Update error handling docs

## Benefits

1. **Better Debugging**: Rich error context for troubleshooting
2. **Error Categorization**: Ability to handle different error types appropriately
3. **Monitoring**: Structured errors enable better error tracking
4. **User Experience**: More helpful error messages
5. **Consistency**: Uniform error handling across the codebase

## Next Steps

1. Review and approve this plan
2. Create `InterfaceError` base class in `@brains/utils`
3. Start with CLI interface as the simplest case
4. Progress through other interfaces
5. Review and update plugin error handling
6. Update documentation

## Estimated Timeline

- **Total Duration**: 4-6 days
- **Priority**: Medium (improves maintainability and debugging)
- **Dependencies**: None (can be done independently)
- **Risk**: Low (pure refactoring, no functional changes)