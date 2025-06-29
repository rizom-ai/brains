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

### Formatter Registration Flow

The system supports two ways to provide formatters:

1. **Via Content Type Registration (Recommended)**

   ```typescript
   // In plugin registration
   contentTypes.register(
     "landing:page",
     landingPageSchema,
     new LandingPageFormatter(),
   );
   ```

   - Formatter is automatically registered with GeneratedContentAdapter
   - Ensures formatter is available whenever content type is used
   - Clean, declarative API

2. **Via Content Templates**

   ```typescript
   const landingPageTemplate: ContentTemplate = {
     name: "landing-page",
     schema: landingPageSchema,
     formatter: new LandingPageFormatter(),
     // ...
   };
   ```

   - Formatter is part of the template definition
   - Used when generating content from templates
   - Note: This doesn't automatically register with GeneratedContentAdapter

The ContentTypeRegistry serves as the central coordination point, ensuring formatters are properly distributed to all components that need them.

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
       const formatter =
         this.formatters.get(entity.contentType) || this.defaultFormatter;

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
       const formatter =
         this.formatters.get(contentType) || this.defaultFormatter;

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
           validationErrors: [
             {
               message: error instanceof Error ? error.message : String(error),
             },
           ],
         };
       }
     }

     // For import/sync operations (parse full markdown file)
     fromMarkdown(markdown: string): Partial<GeneratedContent> {
       const { frontmatter, content } = parseMarkdownWithFrontmatter(markdown);

       // Use parseContent to handle the body
       const parseResult = this.parseContent(
         content,
         (frontmatter.contentType as string) || "unknown",
       );

       return {
         id: frontmatter.id as string,
         entityType: "generated-content",
         contentType: frontmatter.contentType as string,
         data: parseResult.data,
         content: markdown, // Store the full markdown
         metadata: {
           ...((frontmatter.metadata as Record<string, unknown>) || {}),
           validationStatus: parseResult.validationStatus,
           validationErrors: parseResult.validationErrors,
           lastValidData:
             parseResult.validationStatus === "valid"
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

### Generic Formatter Design

After analyzing the LandingPageFormatter implementation, we've identified patterns that can be abstracted into a reusable generic formatter system.

#### Key Patterns Identified

1. **Hierarchical Structure**: Markdown headings map to object nesting (H2 for top-level, H3 for nested)
2. **Section-Based Parsing**: Content is organized into sections identified by headings
3. **Text Extraction**: Common logic for extracting text from markdown paragraphs
4. **Schema Validation**: Final validation against Zod schema

#### StructuredContentFormatter Design

```typescript
class StructuredContentFormatter<T> implements ContentFormatter<T> {
  constructor(
    private schema: z.ZodType<T>,
    private config: FormatterConfig,
  ) {}

  format(data: T): string {
    const lines: string[] = [`# ${this.config.title}`, ""];

    for (const mapping of this.config.mappings) {
      this.formatField(data, mapping, lines, 2);
    }

    return lines.join("\n");
  }

  parse(content: string): T {
    const tree = this.parseMarkdown(content);
    const sections = this.extractSections(tree, 2);
    const data = this.buildDataFromSections(sections);
    return this.schema.parse(data);
  }

  private formatField(
    data: any,
    mapping: FieldMapping,
    lines: string[],
    depth: number,
  ): void {
    const heading = "#".repeat(depth) + " " + mapping.label;
    const value = this.getValueByPath(data, mapping.key);

    switch (mapping.type) {
      case "string":
      case "number":
        lines.push(heading, String(value), "");
        break;
      case "object":
        lines.push(heading);
        if (mapping.children) {
          for (const child of mapping.children) {
            this.formatField(value, child, lines, depth + 1);
          }
        }
        break;
      case "array":
        lines.push(heading, "");
        for (const item of value as any[]) {
          lines.push(`- ${this.formatArrayItem(item)}`);
        }
        lines.push("");
        break;
    }
  }
}
```

#### Example Usage

```typescript
// Dashboard formatter configuration
const dashboardFormatter = new StructuredContentFormatter(dashboardSchema, {
  title: "Dashboard Configuration",
  mappings: [
    { key: "title", label: "Title", type: "string" },
    { key: "description", label: "Description", type: "string" },
    {
      key: "stats",
      label: "Statistics",
      type: "object",
      children: [
        { key: "entityCount", label: "Entity Count", type: "number" },
        { key: "entityTypeCount", label: "Entity Type Count", type: "number" },
        { key: "lastUpdated", label: "Last Updated", type: "string" },
      ],
    },
    {
      key: "recentEntities",
      label: "Recent Entities",
      type: "array",
      itemFormat: (item) => `${item.title} (${item.id}) - ${item.created}`,
    },
  ],
});

// Landing page formatter configuration (refactored)
const landingPageFormatter = new StructuredContentFormatter(landingPageSchema, {
  title: "Landing Page Configuration",
  mappings: [
    { key: "title", label: "Title", type: "string" },
    { key: "tagline", label: "Tagline", type: "string" },
    {
      key: "hero",
      label: "Hero",
      type: "object",
      children: [
        { key: "headline", label: "Headline", type: "string" },
        { key: "subheadline", label: "Subheadline", type: "string" },
        { key: "ctaText", label: "CTA Text", type: "string" },
        { key: "ctaLink", label: "CTA Link", type: "string" },
      ],
    },
  ],
});
```

#### Benefits of Generic Approach

1. **Reduced Code Duplication**: Common parsing/formatting logic in one place
2. **Declarative Configuration**: Easy to understand and maintain
3. **Consistent Format**: All content types follow same structural patterns
4. **Type Safety**: Still validated by Zod schemas
5. **Extensibility**: Easy to add new content types with just configuration

### Implementation Status

**Phase -1: Foundation Work** ✅ Complete

- BaseFormatter renamed to ResponseFormatter
- ContentTemplate interface updated with optional formatter field
- ContentFormatter interface implemented
- Migration strategy documented

**Phase 0: Proof of Concept** ✅ Complete

- DefaultYamlFormatter implemented
- GeneratedContentAdapter updated to use formatters
- LandingPageFormatter created with bidirectional parsing
- Roundtrip tests passing

**Phase 1: Core Infrastructure** ✅ Complete

- ContentTypeRegistry enhanced to store formatters
- PluginContext interface updated to accept formatters
- Formatter registration flow implemented and tested
- GeneratedContentAdapter supports formatter-based conversion

**Phase 2: Generic Formatter Infrastructure** 🚧 Next

- Create StructuredContentFormatter base class
- Extract common utilities from LandingPageFormatter
- Support declarative field mappings
- Test with existing landing page formatter

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

1. **Enhance ContentTypeRegistry to support formatters**
   - Add formatters Map alongside schemas Map
   - Update register method: `register(contentType: string, schema: z.ZodType<unknown>, formatter?: ContentFormatter<unknown>)`
   - Add getFormatter method to retrieve formatters by content type
   - Formatters are optional - content types without formatters use default YAML formatter

2. **Update PluginContext interface**
   - Modify contentTypes.register to accept optional formatter parameter
   - This provides a clean API for plugins to register schemas and formatters together

3. **Connect ContentTypeRegistry with GeneratedContentAdapter**
   - When formatters are registered, automatically register them with GeneratedContentAdapter
   - PluginManager handles this connection during content type registration
   - Ensures formatters are available for both generation and storage

4. **Update ContentTemplate interface to include optional formatter**
   - Already completed in Phase -1
   - Templates can specify custom formatters for human-editable output

5. **Add comprehensive roundtrip tests**
   - Test formatter registration through plugin system
   - Test content generation with custom formatters
   - Test editing and parsing of formatted content

#### Phase 2: Generic Formatter Infrastructure

1. **Create StructuredContentFormatter base class**
   - Extract common patterns from LandingPageFormatter
   - Support declarative field mappings
   - Handle nested objects and arrays
   - Provide utilities for markdown parsing/generation

2. **Design the formatter configuration pattern**

   ```typescript
   interface FieldMapping {
     key: string; // Data field name
     label: string; // Markdown heading
     type: "string" | "number" | "object" | "array";
     children?: FieldMapping[]; // For nested objects
   }
   ```

3. **Implement common formatting utilities**
   - Section extraction by heading depth
   - Text content extraction
   - Value formatting based on type
   - Array/list formatting helpers

4. **Package location decision**
   - Option A: In `@brains/formatters` package alongside ResponseFormatter
   - Option B: In `@brains/shell` package with other content utilities
   - Option C: New `@brains/content-formatters` package
   - Recommendation: Option A - keeps all formatters together

#### Phase 3: Content Type Formatters

1. **Refactor LandingPageFormatter to use StructuredContentFormatter**
   - Define field mappings declaratively
   - Reduce code to just configuration

2. **Create DashboardFormatter using generic approach**
   - Simple configuration-based implementation
   - Handle stats object and recent entities array

3. **Create LandingHeroFormatter**
   - Simpler subset of landing page fields
   - Demonstrate reusability

4. **Update webserver-plugin registrations**
   - Register all formatters with content types
   - Update content templates

5. **Test with real content generation**
   - Verify generic formatter handles all cases
   - Test editing and roundtrip conversion

#### Phase 4: Composite Content & Entity Resolution

1. **Design composite content pattern**
   - Parent entities reference child section entities
   - Adapter resolves references during loading
   - Maintains modular storage while providing complete objects to Astro

2. **Implement entity resolution in adapters**

   ```typescript
   // Example: LandingPageAdapter
   async fromMarkdown(markdown: string): Promise<LandingPageData> {
     const base = parseMarkdown(markdown);

     // Resolve referenced sections
     const [hero, features, cta] = await Promise.all([
       this.entityService.get(base.heroId),
       this.entityService.get(base.featuresId),
       this.entityService.get(base.ctaId)
     ]);

     // Merge into complete object
     return {
       ...base,
       hero: hero?.data || defaultHero,
       features: features?.data || defaultFeatures,
       cta: cta?.data || defaultCta
     };
   }
   ```

3. **Handle content hierarchy**
   - Generated content sections (AI-created, editable)
   - User content overrides (manual edits take precedence)
   - Fallback to defaults if sections missing

4. **Section management tools**
   - Commands to generate/regenerate individual sections
   - Section versioning and rollback
   - Copy sections between pages

#### Phase 5: Production Ready

1. Add validation error handling and recovery
2. Add edit tracking in metadata
3. Update existing content to new format
4. Documentation and examples

### Composite Content Architecture

#### Overview

For complex pages with multiple sections, we use a composite pattern:

1. **Section Entities**: Each section (hero, features, CTA) is its own generated-content entity
   - `webserver:section:hero` - Hero section with its own formatter
   - `webserver:section:features` - Features section with its own formatter
   - `webserver:section:cta` - CTA section with its own formatter

2. **Page Entity**: The main page entity references section entities
   - `webserver:page:landing` - Contains title, tagline, and section IDs
   - Adapter resolves sections during load for Astro

3. **Content Hierarchy**:
   ```
   Landing Page (page entity)
   ├── Title & Tagline (inline data)
   ├── Hero Section (referenced entity)
   ├── Features Section (referenced entity)
   └── CTA Section (referenced entity)
   ```

#### Benefits of Composite Approach

1. **Modular Generation**: AI can generate/regenerate individual sections
2. **Focused Editing**: Edit one section at a time with simpler formatters
3. **Reusability**: Share sections across multiple pages
4. **Version Control**: Track changes to individual sections
5. **Progressive Enhancement**: Start with defaults, customize sections as needed

#### Example Storage

**Landing Page Entity** (`landing-page-main.md`):

````markdown
---
id: landing-page-main
entityType: generated-content
contentType: webserver:page:landing
---

# Landing Page Configuration

```yaml
title: My Personal Knowledge System
tagline: Where thoughts become insights
heroId: hero-section-main
featuresId: features-section-main
ctaId: cta-section-main
```
````

````

**Hero Section Entity** (`hero-section-main.md`):
```markdown
---
id: hero-section-main
entityType: generated-content
contentType: webserver:section:hero
---

# Hero Section

## Headline
Welcome to Your Digital Brain

## Subheadline
Organize, connect, and expand your knowledge

## CTA Text
Get Started

## CTA Link
/dashboard
````

### Benefits of This Approach

1. **Single Source of Truth**: One markdown format that is both stored and edited
2. **Progressive Enhancement**: Can add formatters gradually
3. **Type Safety**: Schema validation ensures edits remain valid
4. **Clean Architecture**: Maintains separation between storage and presentation
5. **Plugin Friendly**: Plugins can provide their own formatters
6. **Git Friendly**: Human-readable diffs for all changes
7. **Modular Content**: Complex pages broken into manageable sections
8. **Flexible Composition**: Mix and match sections across pages

### Content Promotion Pattern

Following the established promote content pattern for user edits:

1. **Generate**: AI creates content as `generated-content` entity
2. **Edit**: Users edit the generated content directly
3. **Promote**: Convert to `site-content` when ready for production

For composite pages:

- Each section can be promoted independently
- Page entity references remain stable (by ID)
- Adapter resolves current entity regardless of type

Example:

```bash
# Generate section
brain generate --template hero-section --id hero-main

# Edit section
brain edit hero-main

# Promote to site content
brain promote hero-main --to site-content
```

### Resolved Questions

1. **How do we handle invalid edits?** → Store with validation errors in metadata
2. **Where do formatters live?** → Part of ContentTemplate definitions
3. **What's the default format?** → YAML in markdown code blocks
4. **Do we need backwards compatibility?** → No, breaking changes are OK
5. **How to handle complex pages?** → Composite pattern with section entities
6. **How to merge sections for Astro?** → Adapter resolves references during load
7. **How to handle user edits?** → Use promote pattern (generated → site-content)

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
