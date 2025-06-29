# Schema Formatter System - Planning Document

## Overview

This document outlines the plan for implementing a schema formatter system that enables flexible display of structured query responses across different interfaces (CLI, Matrix, etc.) while maintaining the clean schema-driven architecture.

## Problem Statement

Currently, the CLI and Matrix interfaces are hardcoded to expect a `message` field from query responses. This limits the system's ability to:

- Display rich, structured data appropriately
- Let contexts define their own response formats
- Provide interface-specific formatting (text vs markdown vs HTML)

## Proposed Solution

Implement a **Schema Formatter System** that:

1. Separates data structure (schemas) from display logic (formatters)
2. Allows contexts to register custom formatters for their schemas
3. Provides intelligent fallbacks for unregistered schemas
4. Maintains backward compatibility with existing `message`-based responses

## Design Philosophy

**Keep it simple**:

- Formatters have one job: transform structured data into human-readable markdown text
- No configuration options - different views should use different formatters
- Interfaces handle presentation concerns (colors, emoji support, etc.)
- Shell outputs markdown, interfaces adapt it to their medium

## Architecture

### Core Components

```typescript
// 1. Simple Formatter Interface - no options!
interface SchemaFormatter {
  format(data: unknown): string;
  canFormat(data: unknown): boolean;
}

// 2. Formatter Registry
class SchemaFormatterRegistry {
  private formatters: Map<string, SchemaFormatter>;
  private defaultFormatter: SchemaFormatter;

  register(schemaName: string, formatter: SchemaFormatter): void;
  format(data: unknown, schemaName?: string): string;
  getFormatter(schemaName: string): SchemaFormatter | null;
}

// 3. Schema-Aware Query Options
interface QueryOptions<T = unknown> {
  schema: z.ZodType<T>;
  schemaName?: string; // Optional hint for formatter selection
  // ... existing options
}
```

### Default Formatters

```typescript
// 1. Smart Default Formatter
class DefaultSchemaFormatter implements SchemaFormatter {
  format(data: unknown): string {
    // Check common display fields first
    if (this.hasField(data, "message")) return data.message;
    if (this.hasField(data, "text")) return data.text;
    if (this.hasField(data, "display")) return data.display;

    // Format known patterns
    if (Array.isArray(data)) return this.formatArray(data);
    if (this.isObject(data)) return this.formatObject(data);

    // Fallback to string representation
    return String(data);
  }

  private formatArray(items: unknown[]): string {
    return items.map((item, i) => `${i + 1}. ${this.format(item)}`).join("\n");
  }

  private formatObject(obj: Record<string, unknown>): string {
    // Smart object formatting with emoji
    const entries = Object.entries(obj);
    return entries
      .map(([key, value]) => {
        const icon = this.getIconForKey(key);
        return `${icon} **${this.humanize(key)}**: ${value}`;
      })
      .join("\n");
  }

  private getIconForKey(key: string): string {
    const icons: Record<string, string> = {
      name: "👤",
      title: "💼",
      email: "📧",
      phone: "📱",
      date: "📅",
      time: "🕐",
      location: "📍",
      status: "📊",
    };
    return icons[key.toLowerCase()] || "•";
  }
}
```

## Implementation Plan

### Phase 1: Core Infrastructure (Week 1)

1. **Create formatter interfaces and base classes**
   - [ ] Define simple `SchemaFormatter` interface in `packages/shell/src/formatters/types.ts`
   - [ ] Implement `SchemaFormatterRegistry` in `packages/shell/src/formatters/registry.ts`
   - [ ] Create `DefaultSchemaFormatter` in `packages/shell/src/formatters/default.ts`
   - [ ] Add formatter registry to Shell class

2. **Update QueryProcessor**
   - [ ] Add optional `schemaName` to `QueryOptions`
   - [ ] Extract schema description as default schemaName hint
   - [ ] Pass schemaName through to query results

3. **Update App interface context**
   - [ ] Modify `processQuery` to use formatter registry
   - [ ] Return formatted markdown instead of just message field
   - [ ] Ensure backward compatibility (message field still works)

### Phase 2: Context Integration (Week 2)

1. **Profile Context Example**

   ```typescript
   class ProfileContext implements Plugin {
     async initialize(shell: Shell) {
       const registry = shell.getFormatterRegistry();

       // Different formatters for different views
       registry.register("profileCard", {
         format: (data) =>
           `👤 ${data.name}\n💼 ${data.title}\n📧 ${data.email}`,
       });

       registry.register("profileDetail", {
         format: (data) => {
           // Full profile with experiences, education, etc.
           return ProfileFormatter.getInstance().format(data);
         },
       });
     }
   }
   ```

2. **Note Context Example**

   ```typescript
   // Simple inline formatter
   registry.register("noteList", {
     format: (data) => {
       return data.notes
         .map((note) => `📝 **${note.title}**\n   ${note.preview}`)
         .join("\n\n");
     },
     canFormat: (data) => data?.notes && Array.isArray(data.notes),
   });
   ```

3. **Task Context Example**

   ```typescript
   // Class-based formatter for complex logic
   class TaskListFormatter implements SchemaFormatter {
     format(data: { tasks: Task[] }): string {
       const grouped = this.groupByStatus(data.tasks);
       return this.formatGroups(grouped);
     }

     canFormat(data: unknown): boolean {
       return data?.tasks && Array.isArray(data.tasks);
     }
   }

   registry.register("taskList", new TaskListFormatter());
   ```

### Phase 3: Interface Adaptations

1. **CLI Interface Emoji Handling**

   ```typescript
   class CLIInterface {
     private supportsEmoji = this.detectEmojiSupport();

     private processResponse(markdown: string): string {
       if (!this.supportsEmoji) {
         return this.stripEmoji(markdown);
       }
       return this.markdownToAnsi(markdown);
     }

     private detectEmojiSupport(): boolean {
       return (
         process.env.TERM_PROGRAM === "iTerm.app" ||
         !!process.env.WT_SESSION || // Windows Terminal
         !!process.env.KONSOLE_VERSION
       );
     }
   }
   ```

2. **Format Hints in Schemas**

   ```typescript
   // Schemas can hint at their preferred formatter
   const profileSummarySchema = z
     .object({
       name: z.string(),
       title: z.string(),
       email: z.string(),
     })
     .describe("profileCard"); // Maps to 'profileCard' formatter

   // QueryProcessor can extract this hint
   const schemaName = schema.description || undefined;
   ```

3. **Fallback Chain**

   ```typescript
   class SchemaFormatterRegistry {
     format(data: unknown, schemaName?: string): string {
       // 1. Try specific formatter if schemaName provided
       if (schemaName && this.formatters.has(schemaName)) {
         return this.formatters.get(schemaName).format(data);
       }

       // 2. Try to find a formatter that can handle this data
       for (const [name, formatter] of this.formatters) {
         if (formatter.canFormat(data)) {
           return formatter.format(data);
         }
       }

       // 3. Use default formatter
       return this.defaultFormatter.format(data);
     }
   }
   ```

## Migration Strategy

### Step 1: Backward Compatibility

- Default formatter checks for `message` field first
- Existing queries continue to work unchanged
- No breaking changes to interfaces

### Step 2: Gradual Adoption

- Contexts can optionally register formatters
- Unregistered schemas fall back to default formatting
- Interfaces can opt-in to formatter options

### Step 3: Full Migration

- All contexts provide appropriate formatters
- Interfaces fully utilize formatter options
- Rich, context-aware displays throughout

## Testing Strategy

### Unit Tests

```typescript
describe("SchemaFormatterRegistry", () => {
  it("should format using registered formatter");
  it("should fall back to default formatter");
  it("should pass options to formatters");
  it("should handle missing schema names");
});

describe("DefaultSchemaFormatter", () => {
  it("should extract message field");
  it("should format arrays as lists");
  it("should format objects as records");
  it("should handle nested data");
});
```

### Integration Tests

```typescript
describe("Query formatting integration", () => {
  it("should format profile queries with ProfileFormatter");
  it("should format note queries with NoteFormatter");
  it("should maintain backward compatibility");
  it("should respect interface-specific options");
});
```

## Benefits

1. **Separation of Concerns**: Data structure vs display logic
2. **Flexibility**: Each context controls its display format
3. **Extensibility**: Easy to add new formatters
4. **Interface Agnostic**: Same data, different displays
5. **Type Safety**: Schemas ensure data structure
6. **Backward Compatible**: No breaking changes

## Example Use Cases

### 1. Profile Query

```typescript
// Query: "Show me John's profile"
// Uses schemaName: "profileCard"

// Response Data:
{
  name: "John Smith",
  title: "Senior Engineer",
  company: "TechCorp",
  email: "john@techcorp.com"
}

// Formatter Output (Markdown):
👤 **John Smith**
💼 Senior Engineer at TechCorp
📧 john@techcorp.com

// CLI displays (if emoji supported):
👤 John Smith              # Bold via ANSI
💼 Senior Engineer at TechCorp
📧 john@techcorp.com

// CLI displays (if no emoji):
[P] John Smith
[W] Senior Engineer at TechCorp
[E] john@techcorp.com
```

### 2. Task List Query

```typescript
// Query
"What are my pending tasks?"

// Response Schema
{
  pending: [
    { id: "1", title: "Review PR", due: "2024-01-20" },
    { id: "2", title: "Update docs", due: "2024-01-21" }
  ],
  completed: 2,
  total: 4
}

// Formatted Output
📋 Pending Tasks (2)
  ⏰ Review PR (due tomorrow)
  📅 Update docs (due in 2 days)

✅ Progress: 2/4 completed
```

### 3. Search Results

```typescript
// Query
"Find notes about TypeScript"

// Response Schema
{
  results: [
    { title: "TypeScript Basics", score: 0.95, excerpt: "..." },
    { title: "Advanced Types", score: 0.87, excerpt: "..." }
  ],
  total: 15,
  query: "TypeScript"
}

// Formatted Output
🔍 Found 15 notes about "TypeScript"

1. TypeScript Basics (95% match)
   "TypeScript is a typed superset of JavaScript..."

2. Advanced Types (87% match)
   "Union types and intersections in TypeScript..."

Showing top 2 results. Use 'search --all' for complete list.
```

## Next Steps

1. Review and approve this plan
2. Create implementation tasks
3. Set up feature branch
4. Begin Phase 1 implementation
5. Create example formatters for testing
6. Document formatter creation guide

## Open Questions

1. Should formatters support async operations (e.g., for data enrichment)?
2. How should we handle formatter errors gracefully?
3. Should we support formatter composition/chaining?
4. Do we need formatter versioning for backward compatibility?
5. Should contexts be able to override default formatters globally?
