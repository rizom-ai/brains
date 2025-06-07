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

### Design Details

1. **ContentFormatter Interface**
   ```typescript
   interface ContentFormatter {
     // Format structured data to human-editable markdown
     formatData(data: Record<string, unknown>): string;
     
     // Parse human-editable markdown back to structured data
     parseData(content: string): Record<string, unknown>;
   }
   ```

2. **ContentTemplate Enhancement**
   ```typescript
   interface ContentTemplate<T = unknown> {
     name: string;
     description: string;
     schema: z.ZodType<T>;
     basePrompt: string;
     formatter?: ContentFormatter; // NEW: optional formatter
   }
   ```

3. **GeneratedContentAdapter Updates**
   ```typescript
   class GeneratedContentAdapter implements EntityAdapter<GeneratedContent> {
     private formatters = new Map<string, ContentFormatter<any>>();
     
     toMarkdown(entity: GeneratedContent): string {
       const formatter = this.formatters.get(entity.contentType);
       
       const frontmatter = {
         id: entity.id,
         entityType: entity.entityType,
         contentType: entity.contentType,
         metadata: entity.metadata,
         created: entity.created,
         updated: entity.updated,
         // Note: data is NOT in frontmatter anymore
       };
       
       // Use formatter if available, otherwise fall back to YAML
       const content = formatter 
         ? formatter.formatData(entity.data)
         : this.defaultFormat(entity.data);
       
       return generateMarkdownWithFrontmatter(content, frontmatter);
     }
     
     fromMarkdown(markdown: string): Partial<GeneratedContent> {
       const { frontmatter, content } = parseMarkdownWithFrontmatter(markdown);
       const formatter = this.formatters.get(frontmatter.contentType);
       
       let data: Record<string, unknown>;
       let validationStatus: 'valid' | 'invalid' = 'valid';
       let validationErrors: unknown[] = [];
       
       try {
         // Parse content
         data = formatter
           ? formatter.parseData(content)
           : this.defaultParseYaml(content);
         
         // Validate against schema
         const schema = this.contentTypeRegistry.get(frontmatter.contentType);
         if (schema) {
           const result = schema.safeParse(data);
           if (!result.success) {
             validationStatus = 'invalid';
             validationErrors = result.error.errors;
           }
         }
       } catch (error) {
         // Parsing failed - store raw content and mark invalid
         validationStatus = 'invalid';
         validationErrors = [{ message: error.message }];
         data = { _rawContent: content };
       }
       
       return {
         ...frontmatter,
         data,
         content: JSON.stringify(data, null, 2),
         metadata: {
           ...frontmatter.metadata,
           validationStatus,
           validationErrors: validationErrors.length > 0 ? validationErrors : undefined,
           lastValidData: frontmatter.metadata?.lastValidData,
         },
       };
     }
   }
   ```

4. **Default YAML Formatter**
   ```typescript
   class DefaultYamlFormatter implements ContentFormatter {
     formatData(data: Record<string, unknown>): string {
       return `# Content Data

\`\`\`yaml
${yaml.dump(data, { indent: 2 })}
\`\`\`

Edit the YAML above to modify the content.`;
     }
     
     parseData(content: string): Record<string, unknown> {
       // Extract YAML from code block
       const yamlMatch = content.match(/```yaml\n([\s\S]*?)\n```/);
       if (!yamlMatch) {
         throw new Error('No YAML code block found');
       }
       return yaml.load(yamlMatch[1]) as Record<string, unknown>;
     }
   }
   ```

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
```

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

### Implementation Plan

#### Phase 0: Proof of Concept (Current)
1. Create ContentFormatter interface
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

1. Implement Phase 0 proof of concept
2. Test with real landing page content
3. Validate the approach works end-to-end
4. Proceed with full implementation if successful