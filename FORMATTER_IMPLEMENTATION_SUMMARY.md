# Schema Formatter System Implementation Summary

## Overview

We successfully implemented a schema formatter system that allows contexts to define how their structured data should be displayed as human-readable markdown. The system maintains a clean separation between data formatting and presentation concerns.

## What Was Implemented

### 1. Core Formatter System (First Commit)

- **SchemaFormatter interface** in `@brains/types` - simple interface for plugins
- **SchemaFormatterRegistry** - manages formatter registration with singleton pattern
- **DefaultSchemaFormatter** - extracts common fields (message, text, display) or falls back to JSON
- **Integration with Shell and PluginContext** - plugins can register their own formatters
- **Comprehensive test coverage** - 30 tests for the formatter system

### 2. QueryProcessor and App Updates (Second Commit)

- **getSchemaName() method** - extracts schema names from Zod schema descriptions
- **Schema name descriptions** - added to all default schemas (defaultQueryResponse, simpleTextResponse, etc.)
- **App interface integration** - uses formatter registry to format query results
- **Tests for schema extraction** - verifies the schema name extraction works correctly

## Architecture Decisions

### 1. Simple Interface

The SchemaFormatter interface is minimal:

```typescript
export interface SchemaFormatter {
  format(data: unknown): string;
  canFormat(data: unknown): boolean;
}
```

### 2. Schema Name Hints

Schemas can hint at which formatter to use via their description:

```typescript
const schema = z
  .object({
    message: z.string(),
  })
  .describe("profileCard"); // Maps to 'profileCard' formatter
```

### 3. Fallback Chain

The formatter registry follows a clear fallback pattern:

1. Try specific formatter if schemaName provided
2. Find first formatter that can handle the data (canFormat returns true)
3. Use default formatter as final fallback

### 4. Clean Separation

- Shell outputs markdown strings
- Interfaces handle presentation (styling, rendering)
- Formatters are pure functions (data → markdown)

## Key Files Changed

### New Files

- `packages/types/src/formatters.ts` - SchemaFormatter interface
- `packages/shell/src/formatters/` - Registry and default implementation
- `packages/shell/test/formatters/` - Comprehensive tests

### Modified Files

- `packages/shell/src/shell.ts` - Added formatter registry
- `packages/shell/src/plugins/pluginManager.ts` - Formatter access in PluginContext
- `packages/shell/src/query/queryProcessor.ts` - Added getSchemaName method
- `packages/shell/src/schemas/defaults.ts` - Added schema descriptions
- `packages/app/src/app.ts` - Uses formatter registry

## Benefits

1. **Extensibility** - Plugins can register custom formatters for their schemas
2. **Consistency** - Default formatter handles common patterns
3. **Flexibility** - Interfaces control final presentation
4. **Type Safety** - Full TypeScript support throughout
5. **Testability** - Pure functions are easy to test

## Next Steps

Plugins can now register custom formatters for rich data display:

```typescript
// In a plugin's register method
context.formatters.register("profileCard", {
  format(data: unknown): string {
    // Custom markdown formatting for profile cards
    return `## ${data.name}\n${data.bio}`;
  },
  canFormat(data: unknown): boolean {
    return typeof data === "object" && "name" in data;
  },
});
```

The formatter system is now ready for use by all contexts and plugins in the brain system.
