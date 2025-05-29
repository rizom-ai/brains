# Entity Models Reference

This document provides references to the current entity models and patterns to help with migration to the new architecture.

## Note Model

### Current Implementation

```typescript
// src/models/note.ts
export interface Note {
  id: string;
  title: string;
  content: string;
  created: string;
  updated: string;
  tags: string[];
  embedding?: number[];
}

export function createNote(
  title: string,
  content: string,
  tags: string[] = [],
): Note {
  return {
    id: crypto.randomUUID(),
    title,
    content,
    created: new Date().toISOString(),
    updated: new Date().toISOString(),
    tags,
  };
}
```

### Storage Implementation

```typescript
// src/services/notes/noteRepository.ts
export class NoteRepository {
  private static instance: NoteRepository | null = null;
  private db: any;

  constructor() {
    this.db = db.getDb();
  }

  public static getInstance(): NoteRepository {
    if (!NoteRepository.instance) {
      NoteRepository.instance = new NoteRepository();
    }
    return NoteRepository.instance;
  }

  async saveNote(note: Note): Promise<Note> {
    await this.db
      .insert(notes)
      .values({
        id: note.id,
        title: note.title,
        content: note.content,
        created: note.created,
        updated: note.updated,
        tags: JSON.stringify(note.tags),
      })
      .onConflictDoUpdate({
        target: notes.id,
        set: {
          title: note.title,
          content: note.content,
          updated: note.updated,
          tags: JSON.stringify(note.tags),
        },
      });

    return note;
  }

  // Other repository methods...
}
```

### Note Context

```typescript
// src/contexts/notes/MCPNoteContext.ts
export class MCPNoteContext {
  private static instance: MCPNoteContext | null = null;
  private noteRepository: NoteRepository;
  private noteSearchService: NoteSearchService;

  constructor() {
    this.noteRepository = NoteRepository.getInstance();
    this.noteSearchService = NoteSearchService.getInstance();
  }

  public static getInstance(): MCPNoteContext {
    if (!MCPNoteContext.instance) {
      MCPNoteContext.instance = new MCPNoteContext();
    }
    return MCPNoteContext.instance;
  }

  async createNote(
    title: string,
    content: string,
    tags: string[] = [],
  ): Promise<Note> {
    const note = createNote(title, content, tags);
    return this.noteRepository.saveNote(note);
  }

  // Other context methods...
}
```

## Profile Model

### Current Implementation

```typescript
// src/models/profile.ts
export interface Profile {
  id: string;
  name: string;
  bio?: string;
  tags: string[];
  skills?: string[];
  experience?: Array<{
    title: string;
    company: string;
    startDate: string;
    endDate?: string;
    description?: string;
  }>;
  created: string;
  updated: string;
}

export function createProfile(
  name: string,
  bio: string = "",
  tags: string[] = [],
): Profile {
  return {
    id: crypto.randomUUID(),
    name,
    bio,
    tags,
    skills: [],
    experience: [],
    created: new Date().toISOString(),
    updated: new Date().toISOString(),
  };
}
```

### Profile Note Adapter

```typescript
// src/contexts/profiles/adapters/profileNoteAdapter.ts
export class ProfileNoteAdapter {
  private noteContext: MCPNoteContext;

  constructor() {
    this.noteContext = MCPNoteContext.getInstance();
  }

  async saveProfile(profile: Profile): Promise<Profile> {
    // Convert profile to note
    const note = this.toNote(profile);

    // Save note
    await this.noteContext.saveNote(note);

    return profile;
  }

  toNote(profile: Profile): Note {
    return {
      id: profile.id,
      title: `Profile: ${profile.name}`,
      content: JSON.stringify(profile, null, 2),
      tags: profile.tags,
      created: profile.created,
      updated: profile.updated,
    };
  }

  fromNote(note: Note): Profile {
    try {
      const profile = JSON.parse(note.content);
      return {
        ...profile,
        id: note.id,
        tags: note.tags,
        created: note.created,
        updated: note.updated,
      };
    } catch (error) {
      throw new Error(`Failed to parse profile from note: ${error.message}`);
    }
  }
}
```

## Website Section Model

### Current Implementation

```typescript
// src/contexts/website/types/landingPageTypes.ts
export interface LandingPageSection {
  id: string;
  sectionType: string;
  title: string;
  content: string;
  status: "draft" | "review" | "published";
  quality?: number;
  created: string;
  updated: string;
}

export function createLandingPageSection(
  sectionType: string,
  title: string,
  content: string,
): LandingPageSection {
  return {
    id: crypto.randomUUID(),
    sectionType,
    title,
    content,
    status: "draft",
    created: new Date().toISOString(),
    updated: new Date().toISOString(),
  };
}
```

### Landing Page Note Adapter

```typescript
// src/contexts/website/adapters/landingPageNoteAdapter.ts
export class LandingPageNoteAdapter {
  private noteContext: MCPNoteContext;

  constructor() {
    this.noteContext = MCPNoteContext.getInstance();
  }

  async saveSection(section: LandingPageSection): Promise<LandingPageSection> {
    // Convert section to note
    const note = this.sectionToNote(section);

    // Save note
    await this.noteContext.saveNote(note);

    return section;
  }

  sectionToNote(section: LandingPageSection): Note {
    return {
      id: section.id,
      title: `Website Section: ${section.title}`,
      content: JSON.stringify(section, null, 2),
      tags: ["website", section.sectionType],
      created: section.created,
      updated: section.updated,
    };
  }

  noteToSection(note: Note): LandingPageSection {
    try {
      const section = JSON.parse(note.content);
      return {
        ...section,
        id: note.id,
        created: note.created,
        updated: note.updated,
      };
    } catch (error) {
      throw new Error(
        `Failed to parse landing page section from note: ${error.message}`,
      );
    }
  }
}
```

## Embedding Generation

### Current Implementation

```typescript
// src/services/notes/noteEmbeddingService.ts
export class NoteEmbeddingService {
  private static instance: NoteEmbeddingService | null = null;
  private embeddings: EmbeddingService;
  private noteRepository: NoteRepository;

  constructor() {
    this.embeddings = EmbeddingService.getInstance();
    this.noteRepository = NoteRepository.getInstance();
  }

  public static getInstance(): NoteEmbeddingService {
    if (!NoteEmbeddingService.instance) {
      NoteEmbeddingService.instance = new NoteEmbeddingService();
    }
    return NoteEmbeddingService.instance;
  }

  async generateEmbedding(note: Note): Promise<number[]> {
    // Combine title and content for better embedding
    const text = `${note.title}\n\n${note.content}`;

    // Generate embedding
    const embedding = await this.embeddings.embed(text);

    // Save embedding to note
    note.embedding = embedding;
    await this.noteRepository.saveNoteEmbedding(note.id, embedding);

    return embedding;
  }
}
```

## Migration Considerations

### Common Patterns to Adopt

1. **Markdown as Storage Format**

   - Current implementation uses JSON or raw text
   - New implementation will use Markdown with frontmatter

2. **Unified Entity Model**

   - Current implementation has separate models and storage
   - New implementation uses a common base entity interface

3. **Plugin Architecture**

   - Current implementation uses singleton instances
   - New implementation uses plugin registration

4. **Consistent Naming**
   - Use 'entity' terminology consistently
   - Use 'adapter' for conversion between formats

### Migration Steps

1. **Create Entity Types**

   - Define Zod schemas for each entity type
   - Implement the IContentModel interface
   - Create entity adapters for markdown conversion

2. **Implement Context Plugins**

   - Convert each context to a plugin
   - Register with the plugin manager
   - Define dependencies explicitly

3. **Update Repositories**

   - Remove entity-specific repositories
   - Use the unified entity service
   - Update queries to use entityType filter

4. **Convert Storage Format**
   - Create migration utilities
   - Convert existing data to markdown format
   - Update embeddings for new format
