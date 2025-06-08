# Human-Editable Generated Content Plan

## Problem Statement

Currently, generated content is stored with structured data in the `data` field of frontmatter, making it difficult for humans to edit. We need a solution that:

1. Allows humans to edit generated content naturally
2. Maintains roundtrip capability (markdown → data → markdown)
3. Preserves type safety and schema validation
4. Works well with version control (meaningful diffs)
5. Integrates cleanly with the existing architecture

## Design Decisions (from Q&A Session)

Through a series of yes/no questions, we've made the following decisions:

1. **Single markdown representation** - The stored format IS the human-editable format (no dual representations)
2. **Separate formatting logic** - Formatters live outside GeneratedContentAdapter
3. **Formatters in templates** - ContentTemplate will include an optional formatter field
4. **Default YAML formatter** - Templates without custom formatters use YAML representation
5. **YAML in body** - Default formatter puts YAML in markdown body, not frontmatter
6. **Schema validation** - Validate edited content against schema when parsing
7. **Store invalid content** - Don't reject saves; store with validation errors in metadata
8. **Recovery data** - Keep last valid version when content becomes invalid
9. **ContentTypeRegistry coordination** - Central management of schemas and formatters
10. **Breaking changes OK** - No need for backwards compatibility

## Architectural Analysis

### Current Adapter Separation

We currently have two types of adapters:

1. **EntityAdapter** (e.g., `BaseEntityAdapter`, `NoteAdapter`)

   - Responsible for entity ↔ markdown conversion
   - Lives with the entity type definition
   - Handles frontmatter generation and parsing
   - Core abstraction for storage layer

2. **ContentAdapter** (e.g., `GeneratedContentAdapter`)
   - Currently a subtype of EntityAdapter
   - Should it be separate?

### Key Questions

1. **Should content formatting be part of the EntityAdapter or separate?**

   - Option A: Keep as-is - EntityAdapter handles everything
   - Option B: EntityAdapter for storage, ContentFormatter for human-readable representation
   - Option C: Merge concepts - all entities have formatters

2. **Where does content-type-specific formatting logic belong?**

   - With the plugin that defines the content type?
   - In a central formatting registry?
   - As part of the content type registration?

3. **How do we handle the relationship between generated-content entities and their formatted representations?**

## Proposed Architecture

### Option 1: Dual Adapter Pattern

```
Entity (data model)
  ↓
EntityAdapter (storage concerns)
  ↓
Markdown (storage format)
  ↓
ContentFormatter (presentation concerns)
  ↓
Human-Editable Markdown (editing format)
```

**Pros:**

- Clear separation of concerns
- Storage format can remain stable while editing format evolves
- Can have multiple formatters per entity type

**Cons:**

- More complex
- Two markdown representations to maintain
- Potential for confusion about which format is canonical

### Option 2: Enhanced EntityAdapter Pattern

```
Entity (data model)
  ↓
EntityAdapter (storage + formatting)
  ↓
Human-Editable Markdown (single format)
```

**Pros:**

- Simpler architecture
- Single source of truth
- No confusion about formats

**Cons:**

- Mixes storage and presentation concerns
- Less flexibility for different editing experiences

### Option 3: Content-Type-Driven Pattern

```
Entity (data model)
  ↓
EntityAdapter (basic storage)
  ↓
ContentTypeRegistry (schema + formatter)
  ↓
Human-Editable Markdown
```

**Pros:**

- Content types own their formatting logic
- Extensible through plugin system
- Co-locates schema and formatting

**Cons:**

- Requires changes to ContentTypeRegistry
- May duplicate logic across content types

## Selected Architecture: Content-Type-Driven Pattern with Formatters

Based on our design decisions, we're implementing a pattern where:

- ContentTemplate includes optional formatters
- GeneratedContentAdapter uses formatters for markdown conversion
- ContentTypeRegistry coordinates schemas and formatters
- Single markdown representation for both storage and editing

### Key Design Decision: Separated Methods

The adapter provides two distinct methods for different use cases:

1. **`parseContent(content, contentType)`** - For editing existing content
   - Used when user edits the markdown body
   - Only parses the content, not frontmatter
   - Returns just the data and validation status
   - Clean and focused on the editing use case

2. **`fromMarkdown(markdown)`** - For import/sync operations
   - Used when importing files from git or other sources
   - Parses both frontmatter and content
   - Returns a full Partial<GeneratedContent>
   - Handles entity reconstruction from files

This separation avoids mixing concerns and makes each method's purpose clear.

### Design Details

1. **ContentFormatter Interface**

   ```typescript
   interface ContentFormatter<T = unknown> {
     // Format structured data to human-editable markdown
     format(data: T): string;

     // Parse human-editable markdown back to structured data
     parse(content: string): T;
   }
   ```

2. **ContentTemplate Enhancement**

   ```typescript
   interface ContentTemplate<T = unknown> {
     name: string;
     description: string;
     schema: z.ZodType<T>;
     basePrompt: string;
     formatter?: ContentFormatter<T>; // NEW: optional formatter
   }
   ```

3. **GeneratedContentAdapter Updates**

   ```typescript
   class GeneratedContentAdapter implements EntityAdapter<GeneratedContent> {
     private formatters = new Map<string, ContentFormatter<any>>();
     private defaultFormatter = new DefaultYamlFormatter();

     // For converting entities to markdown (always uses formatters)
     toMarkdown(entity: GeneratedContent): string {
       const formatter = this.formatters.get(entity.contentType) || this.defaultFormatter;

       const frontmatter = {
         id: entity.id,
         entityType: entity.entityType,
         contentType: entity.contentType,
         metadata: entity.metadata,
         created: entity.created,
         updated: entity.updated,
         // Note: data is NOT in frontmatter anymore
       };

       const content = formatter.format(entity.data);
       return generateMarkdownWithFrontmatter(content, frontmatter);
     }

     // For editing existing content (parse just the body)
     parseContent(content: string, contentType: string): ParseResult {
       const formatter = this.formatters.get(contentType) || this.defaultFormatter;
       
       try {
         const data = formatter.parse(content);
         return {
           data,
           validationStatus: "valid" as const,
         };
       } catch (error) {
         return {
           data: {}, // Return empty object instead of partial data
           validationStatus: "invalid" as const,
           validationErrors: [{
             message: error instanceof Error ? error.message : String(error)
           }],
         };
       }
     }

     // For import/sync operations (parse full markdown file)
     fromMarkdown(markdown: string): Partial<GeneratedContent> {
       const { frontmatter, content } = parseMarkdownWithFrontmatter(markdown);
       
       // Use parseContent to handle the body
       const parseResult = this.parseContent(
         content, 
         frontmatter.contentType as string || "unknown"
       );

       return {
         id: frontmatter.id as string,
         entityType: "generated-content",
         contentType: frontmatter.contentType as string,
         data: parseResult.data,
         content: markdown, // Store the full markdown
         metadata: {
           ...(frontmatter.metadata as Record<string, unknown> || {}),
           validationStatus: parseResult.validationStatus,
           validationErrors: parseResult.validationErrors,
           lastValidData: parseResult.validationStatus === "valid" 
             ? parseResult.data 
             : (frontmatter.metadata as any)?.lastValidData,
         },
         created: frontmatter.created as Date,
         updated: frontmatter.updated as Date,
       };
     }
   }

   type ParseResult = {
     data: Record<string, unknown>;
     validationStatus: "valid" | "invalid";
     validationErrors?: Array<{ message: string }>;
   };
   ```

4. **Default YAML Formatter**
   ```typescript
   class DefaultYamlFormatter implements ContentFormatter<Record<string, unknown>> {
     format(data: Record<string, unknown>): string {
       return `# Content Data
   ```

\`\`\`yaml
${yaml.dump(data, { indent: 2 })}
\`\`\`

Edit the YAML above to modify the content.`;
}

     parse(content: string): Record<string, unknown> {
       // Extract YAML from code block
       const yamlMatch = content.match(/```yaml\n([\s\S]*?)\n```/);
       if (!yamlMatch) {
         throw new Error('No YAML code block found');
       }
       return yaml.load(yamlMatch[1]) as Record<string, unknown>;
     }

}

````

### Example: Landing Page Content

**Generated Markdown:**
```markdown
---
id: abc123
entityType: generated-content
contentType: webserver:landing:page
metadata:
prompt: "Generate landing page for My Brain"
generatedAt: "2024-05-23T10:00:00Z"
generatedBy: "claude-3-sonnet"
created: "2024-05-23T10:00:00Z"
updated: "2024-05-23T10:00:00Z"
---

# Landing Page Configuration

## Hero Section

### Headline
Welcome to Your Digital Brain

### Tagline
Organize, connect, and expand your knowledge with AI-powered intelligence.

### Call to Action
Get Started → /dashboard

## Features

### Smart Organization
- Automatic tagging and categorization
- Intelligent search across all your content
- Visual knowledge graphs

### AI Enhancement
- Content generation and expansion
- Smart summaries and insights
- Conversational knowledge exploration

### Seamless Sync
- Git-based version control
- Multi-device synchronization
- Collaborative knowledge building

## Benefits

### Save Time
Stop searching, start discovering. Your brain finds connections you missed.

### Think Better
Enhance your ideas with AI-powered insights and suggestions.

### Stay Organized
Everything in its place, accessible when you need it.
````

**Human edits it to:**

```markdown
---
id: abc123
entityType: generated-content
contentType: webserver:landing:page
metadata:
  prompt: "Generate landing page for My Brain"
  generatedAt: "2024-05-23T10:00:00Z"
  generatedBy: "claude-3-sonnet"
  editedBy: "human"
  editedAt: "2024-05-24T15:30:00Z"
created: "2024-05-23T10:00:00Z"
updated: "2024-05-24T15:30:00Z"
---

# Landing Page Configuration

## Hero Section

### Headline

My Personal Knowledge System

### Tagline

Where thoughts become insights, powered by AI.

### Call to Action

Start Building → /get-started

## Features

### Smart Organization

- Automatic tagging and categorization
- Intelligent search across all your content
- Visual knowledge graphs
- Custom taxonomies

### AI Enhancement

- Content generation and expansion
- Smart summaries and insights
- Conversational knowledge exploration
- Multi-model support

### Seamless Sync

- Git-based version control
- Multi-device synchronization
- Collaborative knowledge building
- Offline-first architecture

## Benefits

### Think Faster

Your second brain, always ready with the right information.

### Create More

Transform ideas into content with AI assistance.

### Never Forget

Everything you learn, safely stored and instantly searchable.
```

### Implementation Status

**Current State**: Not started. Analysis revealed foundational work needed before implementing Phase 0.

### Implementation Plan

#### Phase -1: Foundation Work (Current)

1. **Resolve naming conflicts**

   - Rename existing `BaseFormatter` to `ResponseFormatter` in `@brains/formatters` package
   - This creates clear distinction: `ResponseFormatter` for API responses vs `ContentFormatter` for human-editable content
   - Update all existing formatters that extend BaseFormatter

2. **Update ContentTemplate interface**

   - Add optional `formatter?: ContentFormatter` field
   - Ensure backwards compatibility (undefined = use default)
   - Update type definitions in `@brains/types` package

3. **Design ContentFormatter interface**

   - Use generics for type safety: `ContentFormatter<T>`
   - Clear method names: `format()` and `parse()`
   - Consider validation integration

4. **Plan migration strategy**

   - Document how to migrate existing content from frontmatter to body
   - Create migration script template
   - Establish versioning strategy for content format

5. **Update existing tests**
   - Ensure GeneratedContentAdapter tests still pass
   - Add test infrastructure for formatter testing

#### Phase 0: Proof of Concept

1. Create ContentFormatter interface implementation
2. Update GeneratedContentAdapter with hardcoded formatter for landing:page
3. Implement default YAML formatter
4. Test roundtrip conversion works
5. Validate the approach before full implementation

#### Phase 1: Core Infrastructure

1. Update ContentTemplate interface to include optional formatter
2. Update GeneratedContentAdapter to use formatter registry
3. Integrate with ContentTypeRegistry
4. Add comprehensive roundtrip tests

#### Phase 2: Content Type Formatters

1. Create LandingPageFormatter with human-friendly format
2. Create DashboardFormatter
3. Update webserver-plugin to provide formatters with templates
4. Test with real content generation

#### Phase 3: Production Ready

1. Add validation error handling and recovery
2. Add edit tracking in metadata
3. Update existing content to new format
4. Documentation and examples

### Benefits of This Approach

1. **Single Source of Truth**: One markdown format that is both stored and edited
2. **Progressive Enhancement**: Can add formatters gradually
3. **Type Safety**: Schema validation ensures edits remain valid
4. **Clean Architecture**: Maintains separation between storage and presentation
5. **Plugin Friendly**: Plugins can provide their own formatters
6. **Git Friendly**: Human-readable diffs for all changes

### Resolved Questions

1. **How do we handle invalid edits?** → Store with validation errors in metadata
2. **Where do formatters live?** → Part of ContentTemplate definitions
3. **What's the default format?** → YAML in markdown code blocks
4. **Do we need backwards compatibility?** → No, breaking changes are OK

### Open Questions for Later

1. Should formatters be versioned to handle schema evolution?
2. Should we support multiple formatter "flavors" per content type?
3. How do we migrate existing generated content to the new format?
4. Do we need a preview/validation CLI command?

## Next Steps

1. Complete Phase -1 foundation work
   - Resolve naming conflicts and establish clear terminology
   - Update ContentTemplate interface in @brains/types
   - Design ContentFormatter interface with proper generics
2. Implement Phase 0 proof of concept
3. Test with real landing page content
4. Validate the approach works end-to-end
5. Proceed with full implementation if successful
