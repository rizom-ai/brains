# Architecture Comparison: Current vs New

This document compares the current architecture with the new proposed approach.

## Current Architecture

### Context System

- Multiple independent contexts (Note, Profile, Website, etc.)
- Direct dependencies between contexts
- Manual integration between components
- Each context implements its own storage patterns
- Complex cross-context communication

### Entity Model

- Separate models for different entity types (Note, Profile, etc.)
- Inconsistent interfaces between entity types
- Hard-coded repository for each entity type
- Duplicate code for common operations (tags, search)
- Complex adapters for converting between models

### Storage Strategy

- Mixed storage strategies
- Some contexts use raw SQL, others use helpers
- Separate storage tables for each entity type
- Embedding and tagging handled differently per context
- Complex conversions between storage and domain models

### Dependencies

- Tightly coupled components
- Direct imports between contexts
- Singletons with hard-coded dependencies
- Complex initialization sequences
- Difficult to isolate for testing

## New Architecture

### Plugin-Based System

- Core shell with pluggable contexts
- Well-defined interfaces between components
- Explicit dependency declarations
- Standardized lifecycle management
- Isolated components with clear boundaries

### Unified Entity Model

- Common base entity interface for all types
- Extensible entity schema with Zod
- Entity types registered with the system
- Consistent markdown-based serialization
- Unified approach to tags, embeddings, and metadata

### Markdown-Centric Storage

- Markdown as primary storage format
- Frontmatter for entity metadata
- Single unified storage table
- Consistent embedding generation
- Simple conversion between storage and domain models

### Dependency Injection

- Registry-based component resolution
- Clear dependency declarations
- Easy to mock components for testing
- Controlled initialization sequence
- No hard-coded singleton access

## Key Improvements

### 1. Simplified Data Model

**Current:**

```typescript
// Different models with inconsistent interfaces
class Note {
  id: string;
  title: string;
  content: string;
  tags: string[];
  // Note-specific fields...
}

class Profile {
  id: string;
  name: string;
  bio: string;
  // Profile-specific fields...
  // No consistent way to convert to/from storage
}
```

**New:**

```typescript
// All entities follow the same base interface
interface IContentModel extends BaseEntity {
  toMarkdown(): string;
}

// Entity-specific interfaces extend the base
interface Note extends IContentModel {
  title: string;
  content: string;
  format: "markdown" | "text" | "html";
}
```

### 2. Unified Storage

**Current:**

```typescript
// Note repository
class NoteRepository {
  async saveNote(note: Note): Promise<Note> {
    // Note-specific storage logic
  }
}

// Profile repository
class ProfileRepository {
  async saveProfile(profile: Profile): Promise<Profile> {
    // Different storage logic
  }
}
```

**New:**

```typescript
// Unified entity service for all entity types
class EntityService {
  async saveEntity<T extends BaseEntity & IContentModel>(
    entity: T,
  ): Promise<T> {
    // Centralized storage logic for all entity types
    // Handles markdown conversion, embedding, tagging
  }
}
```

### 3. Markdown-Centric Approach

**Current:**

```typescript
// Complex conversions between models and storage
class ProfileNoteAdapter {
  toNote(profile: Profile): Note {
    // Complex conversion logic
  }

  fromNote(note: Note): Profile {
    // More complex conversion logic
  }
}
```

**New:**

```typescript
// Simple markdown-based conversion
class ProfileAdapter implements EntityAdapter<Profile> {
  fromMarkdown(markdown: string): Profile {
    // Parse markdown with frontmatter
    const { data, content } = matter(markdown);
    // Create profile from content and metadata
  }

  generateFrontMatter(profile: Profile): string {
    // Generate frontmatter for storage
  }
}
```

### 4. Plugin Architecture

**Current:**

```typescript
// Hard-coded context initialization
const noteContext = NoteContext.getInstance();
const profileContext = ProfileContext.getInstance();
// Manual connection between contexts
```

**New:**

```typescript
// Explicit plugin registration
const notePlugin: ContextPlugin = {
  id: "note-context",
  version: "1.0.0",
  dependencies: ["core"],

  register(context) {
    // Register components and hooks
  },
};

// Register with plugin manager
pluginManager.registerPlugin(notePlugin);
```

## Database Structure Comparison

### Current

- Multiple tables for different entity types
- Inconsistent schema between tables
- Complex joins for cross-entity operations
- Duplicate indexes and constraints
- No standardized approach to embeddings

### New

- Single unified `entities` table with `entity_type` field
- Consistent schema for all entity types
- Simple queries for cross-entity operations
- Standardized indexes and constraints
- Separate `entity_embeddings` table for vector search

## Advantages of New Approach

1. **Simplicity**: Fewer components with clearer responsibilities
2. **Consistency**: Same patterns used across all contexts
3. **Extensibility**: Easy to add new entity types
4. **Testability**: Isolated components with clear interfaces
5. **Performance**: Optimized storage and search patterns
6. **Maintainability**: Less code duplication
7. **Flexibility**: Plugin-based architecture makes it easy to extend
8. **Type Safety**: Zod schemas ensure consistent data structures
9. **Markdown-Native**: Leverages the strength of markdown for content

## Migration Strategy

The new architecture will be implemented as a complete rebuild rather than an incremental refactor, allowing for:

1. A clean break from legacy patterns
2. No compromise on architectural decisions
3. No need to maintain backward compatibility
4. Faster implementation with fewer constraints
5. Better testing from the beginning
