# Content Promotion System Design

## Overview

The content promotion system enables the transformation of immutable generated content into editable user content while maintaining clear relationships and shared formatting logic between content types.

## Problem Statement

Currently, the system has:

- **Generated Content**: Immutable content created by AI (stored as `generated-content` entities)
- **User Content**: Editable content (e.g., `site-content` entities)

The challenge is that generated content cannot be edited directly. Users need a way to "promote" generated content to become editable while:

1. Preserving the original generated version
2. Maintaining formatting consistency
3. Tracking the relationship between generated and promoted content
4. Sharing common logic between generated and user content handling

## Proposed Solution

### 1. Content Promotion Service

Create a new `ContentPromotionService` in the shell that handles:

- Converting `generated-content` entities to appropriate editable entity types
- Tracking promotion relationships through metadata
- Validating content compatibility between types
- Preserving formatting during promotion

```typescript
// packages/shell/src/content/contentPromotionService.ts
export interface PromotionOptions {
  sourceId: string; // Generated content entity ID
  targetEntityType: string; // Target entity type (e.g., "site-content")
  targetMetadata?: Record<string, unknown>; // Additional metadata for target
}

export interface PromotionResult {
  promotedEntity: BaseEntity; // The newly created editable entity
  relationshipId: string; // Tracking ID for the promotion relationship
}
```

### 2. Shared Formatting Infrastructure

Extract common formatting logic to enable code reuse:

```typescript
// packages/shell/src/content/formatters/sharedFormatterBase.ts
export abstract class SharedFormatterBase<T> implements ContentFormatter<T> {
  // Common parsing logic
  protected parseYamlContent(content: string): unknown {}

  // Common formatting logic
  protected formatToYaml(data: T): string {}

  // Common validation
  protected validateContent(data: unknown, schema: ZodSchema): T {}
}
```

### 3. Enhanced Entity Adapters

Update adapters to support promotion metadata:

```typescript
// Generated content tracks promotions
interface GeneratedContentMetadata {
  contentType: string;
  generatedBy: string;
  promotedTo?: Array<{
    entityId: string;
    entityType: string;
    promotedAt: string;
  }>;
}

// Promoted content tracks origin
interface PromotedContentMetadata {
  promotedFrom?: {
    entityId: string;
    entityType: string;
    promotedAt: string;
  };
}
```

### 4. Plugin Integration

Add promotion tools to content-generating plugins:

```typescript
// packages/webserver-plugin/src/tools/promote-content.ts
export const promoteContentTool: McpTool = {
  name: "webserver:promote-content",
  description: "Promote generated content to editable site content",
  inputSchema: z.object({
    generatedContentId: z.string(),
    page: z.string(),
    section: z.string(),
  }),
  handler: async (input, context) => {
    // Use ContentPromotionService to promote content
  },
};
```

## Roundtrip Pattern

The roundtrip pattern leverages the fact that each content section is stored as an independent entity:

### Content Structure

- Each section (hero, features, cta, etc.) is a separate entity
- Content types follow pattern: `plugin:section:name` (e.g., `webserver:section:hero`)
- Sections can be generated, promoted, and regenerated independently

### Roundtrip Flow

1. **Initial Generation**

   ```
   Generate sections → Multiple generated-content entities
   - webserver:section:hero → generated-content-123
   - webserver:section:features → generated-content-456
   - webserver:section:cta → generated-content-789
   ```

2. **Promotion**

   ```
   Promote each section → Multiple site-content entities
   - generated-content-123 → site-content-abc (page: landing, section: hero)
   - generated-content-456 → site-content-def (page: landing, section: features)
   - generated-content-789 → site-content-ghi (page: landing, section: cta)
   ```

3. **User Edits**

   - User edits markdown files via git
   - Changes sync back to site-content entities
   - Each section remains independent

4. **Selective Regeneration**
   ```
   User requests regeneration of specific sections:
   - Generate new webserver:section:hero → generated-content-999
   - Promote generated-content-999 → replaces site-content-abc
   - Other sections (features, cta) remain untouched
   ```

### Key Design Principles

- **Section Independence**: Each section is a complete, standalone entity
- **No Merging**: Regeneration completely replaces the section (no complex merge logic)
- **Explicit Control**: Users specify exactly which sections to regenerate
- **Clean Separation**: Generated content remains immutable; promoted content is editable

### Example Regeneration Tool

```typescript
export const regenerateSectionsTask: McpTool = {
  name: "webserver:regenerate-sections",
  description: "Regenerate specific website sections",
  inputSchema: z.object({
    page: z.string(),
    sections: z.array(z.string()), // ["hero", "features"]
  }),
  handler: async (input, context) => {
    const results = [];

    for (const section of input.sections) {
      // 1. Generate new content for this section
      const generated = await context.generateContent({
        contentType: `section:${section}`,
        prompt: `Generate ${section} section for ${input.page} page`,
        schema: sectionSchemas[section],
        save: true,
      });

      // 2. Get the generated content entity ID
      const generatedEntity = await findLatestGeneratedContent(
        `webserver:section:${section}`,
      );

      // 3. Promote to replace existing site-content
      const promoted = await context.promoteContent({
        sourceId: generatedEntity.id,
        targetEntityType: "site-content",
        targetMetadata: {
          page: input.page,
          section: section,
        },
      });

      results.push(promoted);
    }

    return results;
  },
};
```

## Implementation Plan

### Phase 1: Core Infrastructure

1. Create `ContentPromotionService` with basic promotion logic
2. Add promotion relationship tracking to entity metadata
3. Create shared formatter base class

### Phase 2: Adapter Updates

1. Update `GeneratedContentAdapter` to track promotions
2. Update `SiteContentAdapter` to track origin
3. Ensure both adapters use shared formatting logic

### Phase 3: Plugin Integration

1. Add `promote-content` tool to webserver plugin
2. Add `regenerate-sections` tool for selective regeneration
3. Create UI/CLI commands for content promotion

### Phase 4: Advanced Features

1. Bulk operations (promote/regenerate multiple sections)
2. Section templates and variations
3. A/B testing support (multiple versions of sections)

## Benefits

1. **User Flexibility**: Users can edit AI-generated content without losing the original
2. **Selective Regeneration**: Regenerate only what needs updating
3. **Clean Architecture**: Each section is independent and self-contained
4. **Traceability**: Clear tracking of content lineage
5. **Simple Mental Model**: No complex merging or conflict resolution

## Technical Considerations

### Content Type Compatibility

- Promotion service validates that source content type can be promoted to target entity type
- Plugins register promotion mappings (e.g., `webserver:section:hero` → `site-content`)

### Data Transformation

- Content structure remains the same during promotion
- Only entity metadata changes (type, page, section)

### Metadata Preservation

- Important metadata (creation date, generator) is preserved in promotion relationship
- New metadata (promotion date, user) is added to promoted entity

### Immutability Enforcement

- Generated content remains immutable after promotion
- Only the promoted copy can be edited
- Clear visual/API distinction between generated and promoted content

## Future Extensions

1. **Diff Viewing**: Show differences between generated and edited versions
2. **Merge Strategies**: Future support for intelligent merging (far roadmap)
3. **Version History**: Track all generations and promotions for a section
4. **Promotion Policies**: Rules for what can be promoted and by whom
5. **Cross-Plugin Promotion**: Promote content between different plugin types
