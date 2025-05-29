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

## Architecture

### Core Components

```typescript
// 1. Base Formatter Interface
interface SchemaFormatter {
  format(data: unknown, options?: FormatterOptions): string;
  canFormat(data: unknown): boolean;
}

interface FormatterOptions {
  style?: 'plain' | 'markdown' | 'ansi';
  maxLength?: number;
  includeMetadata?: boolean;
}

// 2. Formatter Registry
class SchemaFormatterRegistry {
  private formatters: Map<string, SchemaFormatter>;
  private defaultFormatter: SchemaFormatter;
  
  register(schemaName: string, formatter: SchemaFormatter): void;
  format(data: unknown, schemaName?: string, options?: FormatterOptions): string;
  getFormatter(schemaName: string): SchemaFormatter | null;
}

// 3. Schema-Aware Query Options
interface QueryOptions<T = unknown> {
  schema: z.ZodType<T>;
  schemaName?: string;  // Optional hint for formatter selection
  // ... existing options
}
```

### Default Formatters

```typescript
// 1. Smart Default Formatter
class DefaultSchemaFormatter implements SchemaFormatter {
  format(data: unknown, options?: FormatterOptions): string {
    // Check common display fields
    if (this.hasField(data, 'message')) return data.message;
    if (this.hasField(data, 'text')) return data.text;
    if (this.hasField(data, 'display')) return data.display;
    
    // Format known patterns
    if (this.looksLikeList(data)) return this.formatList(data, options);
    if (this.looksLikeRecord(data)) return this.formatRecord(data, options);
    
    // Fallback to JSON
    return JSON.stringify(data, null, 2);
  }
}

// 2. Pattern-Based Formatters
class ListFormatter implements SchemaFormatter {
  canFormat(data: unknown): boolean {
    return Array.isArray(data) || 
           (typeof data === 'object' && 'items' in data);
  }
  
  format(data: unknown, options?: FormatterOptions): string {
    // Format arrays and list-like objects
  }
}

class RecordFormatter implements SchemaFormatter {
  canFormat(data: unknown): boolean {
    return typeof data === 'object' && 
           !Array.isArray(data) &&
           Object.keys(data).length > 0;
  }
  
  format(data: unknown, options?: FormatterOptions): string {
    // Format object records with nice key-value display
  }
}
```

## Implementation Plan

### Phase 1: Core Infrastructure (Week 1)

1. **Create formatter interfaces and base classes**
   - [ ] Define `SchemaFormatter` interface in `packages/shell/src/formatters/types.ts`
   - [ ] Implement `SchemaFormatterRegistry` in `packages/shell/src/formatters/registry.ts`
   - [ ] Create `DefaultSchemaFormatter` in `packages/shell/src/formatters/default.ts`
   - [ ] Add formatter registry to Shell class

2. **Update QueryProcessor**
   - [ ] Add optional `schemaName` to `QueryOptions`
   - [ ] Store schema name with query results for formatter hints
   - [ ] Maintain backward compatibility

3. **Update App interface context**
   - [ ] Modify `processQuery` to use formatter registry
   - [ ] Pass formatter options based on interface type
   - [ ] Ensure existing behavior remains unchanged

### Phase 2: Context Integration (Week 2)

1. **Profile Context Example**
   ```typescript
   class ProfileContext implements Plugin {
     async initialize(shell: Shell) {
       const registry = shell.getFormatterRegistry();
       
       // Register profile-specific formatters
       registry.register('profileSummary', new ProfileSummaryFormatter());
       registry.register('profileExperiences', new ProfileExperienceFormatter());
       registry.register('profileSkills', new ProfileSkillsFormatter());
     }
   }
   ```

2. **Note Context Example**
   ```typescript
   registry.register('noteList', {
     format: (data) => {
       return data.notes
         .map(note => `📝 ${note.title}\n   ${note.preview}`)
         .join('\n\n');
     }
   });
   ```

3. **Task Context Example**
   ```typescript
   registry.register('taskList', new TaskListFormatter({
     groupByStatus: true,
     showDueDates: true,
     useEmoji: true
   }));
   ```

### Phase 3: Advanced Features (Week 3)

1. **Interface-Specific Formatting**
   ```typescript
   // CLI Interface
   processQuery(query, { 
     formatterOptions: { style: 'ansi' } 
   });
   
   // Matrix Interface  
   processQuery(query, { 
     formatterOptions: { style: 'markdown' } 
   });
   ```

2. **Composite Formatters**
   ```typescript
   class CompositeFormatter implements SchemaFormatter {
     constructor(private formatters: SchemaFormatter[]) {}
     
     format(data: unknown, options?: FormatterOptions): string {
       for (const formatter of this.formatters) {
         if (formatter.canFormat(data)) {
           return formatter.format(data, options);
         }
       }
       throw new Error('No suitable formatter found');
     }
   }
   ```

3. **Format Hints in Schemas**
   ```typescript
   const profileSchema = z.object({
     name: z.string(),
     title: z.string(),
   }).describe('profileSummary'); // Hint for formatter selection
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
describe('SchemaFormatterRegistry', () => {
  it('should format using registered formatter');
  it('should fall back to default formatter');
  it('should pass options to formatters');
  it('should handle missing schema names');
});

describe('DefaultSchemaFormatter', () => {
  it('should extract message field');
  it('should format arrays as lists');
  it('should format objects as records');
  it('should handle nested data');
});
```

### Integration Tests
```typescript
describe('Query formatting integration', () => {
  it('should format profile queries with ProfileFormatter');
  it('should format note queries with NoteFormatter');
  it('should maintain backward compatibility');
  it('should respect interface-specific options');
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
// Query
"Show me John's profile"

// Response Schema
{
  name: "John Smith",
  title: "Senior Engineer",
  company: "TechCorp",
  skills: ["TypeScript", "React", "Node.js"]
}

// CLI Format (ANSI)
👤 John Smith
💼 Senior Engineer at TechCorp
🛠️ Skills: TypeScript, React, Node.js

// Matrix Format (Markdown)
**John Smith**
*Senior Engineer at TechCorp*
- TypeScript
- React  
- Node.js
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