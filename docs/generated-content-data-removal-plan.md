# Generated Content Data Field Removal Plan

## Overview

This plan outlines the removal of the `data` field from generated content entities, moving to a model where only formatted markdown content is stored. Structured data will be parsed on-demand when needed.

## Current State

### Problems with Current Implementation
1. **Two sources of truth**: Both `data` (structured) and `content` (formatted markdown) are stored
2. **Sync issues**: Risk of data and content getting out of sync
3. **Storage overhead**: Redundant storage of the same information
4. **Complexity**: Code must handle both fields

### Current Flow
```
AI Response → Structured Data → Save to `data` field
                              ↓
                         Format to markdown → Save to `content` field
```

## Proposed Solution

### New Model
- **Single field**: Only `content` field containing formatted markdown
- **Parse on-demand**: When structured data is needed (e.g., promotion), parse from content
- **Validation on import**: Parse content during import to ensure it's valid

### New Flow
```
AI Response → Structured Data → Format to markdown → Save to `content` field

On Read: Parse markdown → Validate format (don't return data)
On Promote: Parse markdown → Extract structured data → Use for promotion
```

## Implementation Steps

### 1. Update Type Definition
Remove `data` field from `generatedContentSchema`:

```typescript
// packages/types/src/entities.ts
export const generatedContentSchema = baseEntitySchema.extend({
  entityType: z.literal("generated-content"),
  contentType: z.string(),
  generatedBy: z.string(),
  // Remove: data: z.record(z.unknown()),
});
```

### 2. Update ContentGenerationService
Format content before saving:

```typescript
// packages/shell/src/content/contentGenerationService.ts
private async saveGeneratedContent(content: unknown, contentType: string): Promise<void> {
  // Format the content immediately using the appropriate formatter
  const formatter = this.contentTypeRegistry?.getFormatter(contentType);
  const formattedContent = formatter 
    ? formatter.format(content as Record<string, unknown>)
    : JSON.stringify(content, null, 2);

  await this.entityService.createEntity<GeneratedContent>({
    entityType: "generated-content",
    contentType: contentType,
    content: formattedContent,
    generatedBy: "claude-3-sonnet",
  });
}
```

### 3. Update GeneratedContentAdapter

#### toMarkdown - Simplify to just extract content body:
```typescript
public toMarkdown(entity: GeneratedContent): string {
  const frontmatter = {
    id: entity.id,
    entityType: entity.entityType,
    contentType: entity.contentType,
    generatedBy: entity.generatedBy,
    created: entity.created,
    updated: entity.updated,
  };

  // Extract body content (remove frontmatter if present)
  let content: string;
  try {
    const parsed = parseMarkdownWithFrontmatter(entity.content || "", generatedContentFrontmatterSchema);
    content = parsed.content;
  } catch {
    content = entity.content || "";
  }

  return generateMarkdownWithFrontmatter(content, frontmatter);
}
```

#### fromMarkdown - Parse for validation only:
```typescript
public fromMarkdown(markdown: string): Partial<GeneratedContent> {
  const parsed = parseMarkdownWithFrontmatter(markdown, generatedContentFrontmatterSchema);
  const frontmatter = parsed.metadata;
  const content = parsed.content;

  // Validate content can be parsed (but don't return the data)
  const formatter = this.getFormatter(frontmatter.contentType);
  try {
    formatter.parse(content); // Validation only
  } catch (error) {
    this.logger.warn(`Content parsing failed for ${frontmatter.contentType}`, error);
  }

  return {
    id: frontmatter.id,
    entityType: "generated-content" as const,
    contentType: frontmatter.contentType,
    content: markdown,
    generatedBy: frontmatter.generatedBy,
    created: frontmatter.created,
    updated: frontmatter.updated,
  };
}
```

### 4. Update MCP Adapter
```typescript
private async saveGeneratedContent(
  content: unknown,
  contentType: string,
): Promise<{ content: unknown; entityId: string; message: string }> {
  // Format content if formatter available
  const formatter = this.contentTypeRegistry?.getFormatter(contentType);
  const formattedContent = formatter 
    ? formatter.format(content as Record<string, unknown>)
    : JSON.stringify(content, null, 2);

  const entity = await this.entityService.createEntity<GeneratedContent>({
    entityType: "generated-content",
    contentType: contentType,
    content: formattedContent,
    generatedBy: "claude-3-sonnet",
  });

  return {
    content, // Return original structured data to caller
    entityId: entity.id,
    message: `Generated and saved as entity ${entity.id}`,
  };
}
```

### 5. Update Promotion/Derive Logic
When promoting content, parse on-demand:

```typescript
// In deriveEntity or promotion logic
const sourceEntity = await getEntity(sourceId);
if (sourceEntity.entityType === "generated-content") {
  // Parse content to get structured data for promotion
  const formatter = this.getFormatter(sourceEntity.contentType);
  const structuredData = formatter.parse(sourceEntity.content);
  
  // Use structuredData for creating the new entity
  await createEntity({
    entityType: targetType,
    content: sourceEntity.content, // Copy markdown as-is
    // ... map other fields as needed
  });
}
```

### 6. Update getGeneratedContent Method
```typescript
public async getGeneratedContent(
  contentType: string,
  id?: string,
): Promise<unknown | null> {
  const entity = await this.entityService.getEntity<GeneratedContent>(
    "generated-content",
    id
  );
  
  if (!entity) return null;
  
  // Parse content on-demand to return structured data
  const formatter = this.getFormatter(entity.contentType);
  try {
    return formatter.parse(entity.content);
  } catch {
    return null;
  }
}
```

## Testing Strategy

### 1. Unit Tests
- Test formatting and parsing roundtrip for each formatter
- Test adapter's toMarkdown/fromMarkdown without data field
- Test save operations with only content field
- Test validation on import

### 2. Integration Tests
- Test full flow: generate → save → export → import → promote
- Test git sync with new format
- Test backward compatibility (if needed)

### 3. Test Updates Needed
- Remove all references to `data` field in tests
- Update mock data to exclude `data` field
- Update test assertions to check content formatting

## Migration Considerations

### For Existing Data
Since generated content is immutable and we're already storing formatted content:
1. Existing entities will continue to work (they have both fields)
2. New entities will only have content field
3. No migration needed - old entities will just have unused data field

### Backward Compatibility
- Code that reads `entity.data` will need updates
- Consider adding a getter that parses on-demand for transition period

## Benefits

1. **Single source of truth**: Only markdown content is stored
2. **Reduced storage**: No duplicate data
3. **Simpler model**: Easier to understand and maintain
4. **Consistency**: Content is always the authoritative source
5. **Flexibility**: Can change formatters without re-storing data

## Risks and Mitigations

1. **Risk**: Parsing overhead when accessing structured data
   - **Mitigation**: Only parse when needed (promotion, specific queries)
   - **Mitigation**: Consider caching parsed data in memory if performance is an issue

2. **Risk**: Invalid content that can't be parsed
   - **Mitigation**: Validate on import, log warnings
   - **Mitigation**: Graceful fallback for unparseable content

3. **Risk**: Breaking existing code expecting data field
   - **Mitigation**: Thorough testing
   - **Mitigation**: Clear error messages when data is accessed