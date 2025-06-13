# Site Content Schema Validation Design

## Overview

This document outlines the design for adding schema validation to user-editable site content entities. The goal is to ensure that both AI-generated and user-edited content conform to the same schemas, providing type safety and data integrity throughout the content lifecycle.

## Problem Statement

Currently, the system has a critical gap:
- **Content Generation**: Uses strongly-typed schemas (e.g., `landingHeroDataSchema`)
- **Site Content Storage**: Uses untyped `data: z.record(z.unknown())`
- **Result**: When content is promoted or edited, we lose type validation

This means:
1. User edits via markdown files are not validated
2. Malformed content can break the website build
3. No compile-time or runtime guarantees about content structure
4. Formatters work on trust rather than validated data

## Core Insight

The `ContentTypeRegistry` already knows about content schemas (e.g., `webserver:section:hero` → `landingHeroDataSchema`). We need to leverage this existing knowledge to validate site content based on its `page` and `section` fields.

## Proposed Solution

### Enhanced Site Content Adapter

Make the site-content adapter schema-aware by injecting the ContentTypeRegistry:

```typescript
// packages/webserver-plugin/src/site-content-adapter.ts
export class SiteContentAdapter implements EntityAdapter<SiteContent> {
  private contentTypeRegistry: ContentTypeRegistry | null = null;

  // Allow registry injection for schema validation
  public setContentTypeRegistry(registry: ContentTypeRegistry): void {
    this.contentTypeRegistry = registry;
  }

  public fromMarkdown(markdown: string): Partial<SiteContent> {
    const { content, metadata } = parseMarkdownWithFrontmatter(
      markdown,
      frontmatterSchema,
    );

    // Parse YAML content
    let parsedData = yaml.load(content) as Record<string, unknown>;

    // Validate against registered schema if available
    if (this.contentTypeRegistry && metadata.page && metadata.section) {
      const contentType = this.resolveContentType(metadata.page, metadata.section);
      const schema = this.contentTypeRegistry.get(contentType);
      
      if (schema) {
        // Validate and parse with proper schema
        parsedData = schema.parse(parsedData);
      }
    }

    return {
      page: metadata.page,
      section: metadata.section,
      data: parsedData,
    };
  }

  private resolveContentType(page: string, section: string): string {
    // For now, assume webserver plugin namespace
    // Could be made more flexible later
    return `webserver:section:${section}`;
  }
}
```

### Integration Points

1. **Plugin Registration**: When webserver plugin registers, it connects the adapter to ContentTypeRegistry
2. **Entity Service**: During import/update, validation happens automatically via the adapter
3. **Git Sync**: User edits are validated when synced from markdown files

## Implementation Details

### Phase 1: Core Validation

1. **Update SiteContentAdapter**
   - Add ContentTypeRegistry dependency
   - Implement schema lookup based on page/section
   - Validate data during fromMarkdown

2. **Update Webserver Plugin**
   - Wire ContentTypeRegistry to adapter during registration
   - Ensure all content types are registered before adapter is used

3. **Error Handling**
   - Log validation errors with clear messages
   - Optionally allow "loose mode" for backward compatibility

### Phase 2: Type Safety Improvements

1. **Typed Site Content**
   ```typescript
   // Instead of generic Record<string, unknown>
   export interface TypedSiteContent<T = unknown> extends SiteContent {
     data: T;
   }
   ```

2. **Schema Registry Extensions**
   ```typescript
   // Register page/section mappings
   contentTypeRegistry.registerMapping(
     { page: "landing", section: "hero" },
     "webserver:section:hero"
   );
   ```

### Phase 3: Developer Experience

1. **Validation Commands**
   - Tool to validate all site-content entities
   - Pre-commit hooks for markdown validation

2. **Schema Documentation**
   - Auto-generate docs from registered schemas
   - Show expected structure for each page/section

## Benefits

1. **Type Safety**: Content structure is validated at every step
2. **Early Error Detection**: Invalid edits caught during sync, not at build time
3. **Better DX**: Clear error messages when content doesn't match schema
4. **Consistency**: Same schemas used for generation and validation
5. **Extensibility**: Plugins can register their own content schemas

## Migration Path

1. **Backward Compatibility**: Initially only log warnings for invalid content
2. **Gradual Enforcement**: Move to strict validation after content is migrated
3. **Migration Tools**: Provide tools to validate and fix existing content

## Comparison with Previous Design

This design focuses on the core need (schema validation) rather than complex promotion tracking:

- **Simpler**: No new services or relationship tracking
- **Focused**: Solves the immediate problem of unvalidated user content
- **Leverages Existing**: Uses ContentTypeRegistry that already exists
- **Minimal Changes**: Mainly updates to SiteContentAdapter

The previous design attempted to solve multiple problems (promotion, tracking, relationships). This design solves one problem well: ensuring user content is valid.

## Future Extensions

1. **Custom Validators**: Plugins can provide custom validation logic
2. **Schema Evolution**: Handle schema changes over time
3. **Partial Schemas**: Support optional fields for incremental content
4. **Cross-References**: Validate references between content sections
5. **Content Linting**: Style and quality checks beyond schema validation

## Example Usage

```typescript
// When user edits hero section in markdown:
// site-content/landing-hero.md
---
page: landing
section: hero
---
headline: "Welcome to Our Platform"
subheadline: "Build amazing things"
ctaText: "Get Started"
ctaLink: "/signup"

// The adapter will:
1. Parse the frontmatter (page: landing, section: hero)
2. Look up schema for webserver:section:hero
3. Validate the YAML content against landingHeroDataSchema
4. Return properly typed SiteContent with validated data
```

This ensures that whether content comes from AI generation or user edits, it always conforms to the expected schema.