# Base Entity Package - Planning Document

## Overview

This document outlines the plan for implementing a `@brains/base-entity` package that provides fallback entity handling for the Brain system. This package will ensure that basic entity operations work even without specialized entity plugins, while maintaining compatibility with Git repositories.

## Problem Statement

Currently, the Brain system depends on specialized entity plugins (like Note Context) to register and handle specific entity types. Without these plugins:

1. The system cannot store or retrieve entities
2. Git repositories with generic entities cannot be properly imported
3. Testing requires implementing mock entity plugins

A base entity package would provide:
- Default entity handling for any entity type
- Consistent serialization/deserialization to/from Markdown
- Compatibility with existing Git repositories
- Foundation for specialized entity types to build upon

## Proposed Solution

Create a **@brains/base-entity** package that:

1. Provides a BaseEntityAdapter for serializing/deserializing generic entities
2. Defines standard schemas and interfaces for base entities
3. Includes utility functions for working with generic entities
4. Offers a default formatter for displaying base entities

The Shell will depend on this package and automatically register the base entity type during initialization, before any plugins are loaded.

## Design Philosophy

**Stand-alone, reusable components**:
- Clean separation from core Shell functionality
- Well-defined interfaces for extensibility
- Consistent with existing project architecture
- Versioned independently from Shell

## Package Structure

```
packages/base-entity/
├── package.json
├── tsconfig.json
├── src/
│   ├── index.ts              # Main exports
│   ├── adapter.ts            # BaseEntityAdapter implementation
│   ├── schema.ts             # Entity schemas and validation
│   ├── formatter.ts          # BaseEntityFormatter
│   ├── utils/
│   │   ├── serialization.ts  # Markdown serialization utilities
│   │   └── validation.ts     # Entity validation utilities
│   └── types.ts              # Type definitions
└── test/
    ├── adapter.test.ts
    ├── formatter.test.ts
    └── utils.test.ts
```

## Core Components

### 1. BaseEntityAdapter

The adapter handles conversion between entity objects and markdown files:

```typescript
import { EntityAdapter } from "@brains/types";
import { BaseEntity } from "@brains/types";
import matter from "gray-matter";
import { generateId } from "./utils/serialization";

/**
 * Adapter for base entity type - handles serialization/deserialization
 */
export class BaseEntityAdapter implements EntityAdapter<BaseEntity> {
  /**
   * Serialize entity to markdown with frontmatter
   */
  serialize(entity: BaseEntity): string {
    // Extract frontmatter fields
    const { content, ...metadata } = entity;
    
    // Generate YAML frontmatter
    return matter.stringify(content || "", metadata);
  }

  /**
   * Deserialize markdown to entity
   */
  deserialize(markdown: string, id?: string): BaseEntity {
    // Parse markdown with frontmatter
    const parsed = matter(markdown);
    
    // Extract entity fields from frontmatter
    const entity: BaseEntity = {
      id: id || parsed.data.id || generateId(),
      entityType: parsed.data.entityType || "base",
      title: parsed.data.title || "",
      content: parsed.content,
      created: parsed.data.created || new Date().toISOString(),
      updated: parsed.data.updated || new Date().toISOString(),
      tags: parsed.data.tags || [],
    };
    
    return entity;
  }

  /**
   * Validate entity against schema
   */
  validate(entity: unknown): entity is BaseEntity {
    return baseEntitySchema.safeParse(entity).success;
  }
}
```

### 2. Base Entity Schema

```typescript
import { z } from "zod";

/**
 * Schema for base entity validation
 */
export const baseEntitySchema = z.object({
  id: z.string(),
  entityType: z.string().default("base"),
  title: z.string(),
  content: z.string().default(""),
  created: z.string().datetime(),
  updated: z.string().datetime(),
  tags: z.array(z.string()).default([]),
});

/**
 * Type definition for base entity
 */
export type BaseEntity = z.infer<typeof baseEntitySchema>;
```

### 3. Base Entity Formatter

```typescript
import { SchemaFormatter } from "@brains/types";
import type { BaseEntity } from "@brains/types";
import { formatDate } from "./utils/serialization";

/**
 * Formatter for base entities
 */
export class BaseEntityFormatter implements SchemaFormatter {
  format(data: unknown): string {
    if (!this.canFormat(data)) {
      return String(data);
    }

    const entity = data as BaseEntity;
    
    // Format as markdown
    return `# ${entity.title}

${entity.content}

---
**Type**: ${entity.entityType}
**Tags**: ${entity.tags.join(", ") || "None"}
**Created**: ${formatDate(entity.created)}
**Updated**: ${formatDate(entity.updated)}
`;
  }

  canFormat(data: unknown): boolean {
    return (
      typeof data === "object" &&
      data !== null &&
      "id" in data &&
      "entityType" in data &&
      "title" in data
    );
  }
}
```

### 4. Integration with Shell

The Shell package will need minor modifications to use the BaseEntityAdapter:

```typescript
// Inside Shell class constructor
import { BaseEntityAdapter, baseEntitySchema, BaseEntityFormatter } from "@brains/base-entity";

private registerBaseEntitySupport(): void {
  this.logger.debug("Registering base entity support");

  // Create base entity adapter
  const baseEntityAdapter = new BaseEntityAdapter();
  
  // Register with entity registry
  this.entityRegistry.register(
    "base",
    baseEntitySchema,
    baseEntityAdapter
  );
  
  // Register formatter
  this.formatterRegistry.register(
    "baseEntity",
    new BaseEntityFormatter()
  );
  
  this.logger.debug("Base entity support registered");
}
```

## Usage Examples

### Importing from a Git Repository

```typescript
// Any markdown files with frontmatter can be loaded
const entities = await importFromGitRepo("./my-repo", {
  pattern: "**/*.md",
});

// They'll be loaded as base entities if no specialized handler exists
console.log(entities[0].entityType); // "base" or original type if preserved
```

### Creating a Base Entity

```typescript
// Create a generic entity
const entity = await shell.getEntityService().createEntity({
  title: "Example Entity",
  content: "This is a simple entity with no specialized handling",
  tags: ["example", "generic"],
});

// Will be stored as markdown with frontmatter
```

### Plugin Override

```typescript
// Specialized plugins can override
class NotePlugin implements Plugin {
  register(context) {
    // Register specialized note adapter
    context.entityRegistry.register(
      "note", 
      noteSchema, 
      new NoteAdapter()
    );
  }
}
```

## Implementation Strategy

### Phase 1: Package Creation (Week 1)

1. Create @brains/base-entity package structure
2. Implement BaseEntityAdapter with Markdown serialization
3. Define base entity schema
4. Create BaseEntityFormatter
5. Write comprehensive unit tests

### Phase 2: Shell Integration (Week 1)

1. Add dependency on @brains/base-entity to Shell package
2. Implement registerBaseEntitySupport() method
3. Call this method during Shell initialization
4. Update unit tests for Shell

### Phase 3: Documentation & Examples (Week 2)

1. Update entity model documentation
2. Add examples for working with base entities
3. Document Git repository compatibility

## Testing Strategy

### Unit Tests

The package will include comprehensive unit tests:

```typescript
describe("BaseEntityAdapter", () => {
  it("should serialize entities to markdown with frontmatter");
  it("should deserialize markdown to entities");
  it("should handle missing fields with defaults");
  it("should preserve all entity fields during serialization");
  it("should validate entities against schema");
});

describe("BaseEntityFormatter", () => {
  it("should format entities as readable markdown");
  it("should include all essential entity information");
  it("should handle missing fields gracefully");
});
```

### Integration Tests

Shell integration tests will verify:

```typescript
describe("Shell with base entity support", () => {
  it("should register base entity type during initialization");
  it("should create and retrieve base entities");
  it("should search base entities by content");
  it("should allow plugins to override base entity behavior");
});
```

## Benefits

1. **Git Compatibility**: Ensures compatibility with existing Git repositories
2. **Always Available**: Base functionality without specialized plugins
3. **Clean Architecture**: Follows established package structure pattern
4. **Independent Versioning**: Can evolve separately from Shell
5. **Foundation for Plugins**: Provides reference implementation for plugin authors

## Dependencies

- @brains/types: For shared type definitions
- @brains/utils: For common utilities
- gray-matter: For frontmatter parsing and serialization
- zod: For schema validation

## Open Questions

1. Should the BaseEntityAdapter support custom frontmatter fields beyond the standard BaseEntity properties?
2. How should conflicts be handled when specialized plugins try to process base entities?
3. Should we add special support for Git repository synchronization in the adapter?

## Next Steps

1. Review and finalize this plan
2. Create package structure and initial implementation
3. Integrate with Shell
4. Write tests
5. Update documentation