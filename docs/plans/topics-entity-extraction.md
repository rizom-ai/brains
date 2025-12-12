# Topics Plugin: Entity-Based Extraction

## Overview

Modify the topics plugin to extract topics from entities (posts, summaries, links, etc.) instead of conversation messages.

## Current Behavior

- Subscribes to `conversation:digest` events
- Extracts topics from conversation message windows
- Sources reference conversations only (`type: "conversation"`)
- Config includes `windowSize` for message batching

## New Behavior

- Subscribe to `entity:created` and `entity:updated` events
- Extract topics from entity content (markdown body)
- Sources reference the source entity (e.g., `type: "post"`)
- Config supports whitelist OR blacklist for entity type filtering

## Changes Required

### 1. Config Schema (`src/schemas/config.ts`)

**Remove:**

- `windowSize`

**Add:**

- `includeEntityTypes: string[]` - whitelist (default: `[]`, means include none)
- `excludeEntityTypes: string[]` - blacklist (default: `[]`)

Logic:

- If `includeEntityTypes` is non-empty, only those types are processed (whitelist mode)
- If `includeEntityTypes` is empty, all types except `excludeEntityTypes` are processed (blacklist mode)
- `topic` type is always excluded to prevent recursion

**Keep:**

- `minRelevanceScore`
- `mergeSimilarityThreshold`
- `autoMerge`
- `enableAutoExtraction`

```typescript
export const topicsPluginConfigSchema = z.object({
  includeEntityTypes: z.array(z.string()).default([]),
  excludeEntityTypes: z.array(z.string()).default([]),
  minRelevanceScore: z.number().min(0).max(1).default(0.5),
  mergeSimilarityThreshold: z.number().min(0).max(1).default(0.85),
  autoMerge: z.boolean().default(true),
  enableAutoExtraction: z.boolean().default(true),
});
```

### 2. Topic Source Schema (`src/schemas/topic.ts`)

Change source type to support entity types:

```typescript
export const topicSourceSchema = z.object({
  id: z.string(),
  title: z.string(),
  type: z.string(), // Any entity type
});
```

### 3. Topic Extractor (`src/lib/topic-extractor.ts`)

**Replace** conversation-based methods with:

```typescript
public async extractFromEntity(
  entity: BaseEntity,
  minRelevanceScore: number,
): Promise<ExtractedTopic[]>
```

**Remove:**

- `extractFromConversationWindow()`
- `extractFromMessages()`

### 4. Plugin (`src/index.ts`)

**Add helper for filtering:**

```typescript
private shouldProcessEntityType(entityType: string): boolean {
  // Always skip topics
  if (entityType === "topic") {
    return false;
  }

  // Whitelist mode: only process included types
  if (this.config.includeEntityTypes.length > 0) {
    return this.config.includeEntityTypes.includes(entityType);
  }

  // Blacklist mode: process all except excluded types
  return !this.config.excludeEntityTypes.includes(entityType);
}
```

**Replace subscription:**

```typescript
const handleEntityEvent = async (message) => {
  const { entityType, entity } = message.payload;

  if (!this.shouldProcessEntityType(entityType)) {
    return { success: true };
  }

  await this.handleEntityChanged(context, entity);
  return { success: true };
};

context.subscribe("entity:created", handleEntityEvent);
context.subscribe("entity:updated", handleEntityEvent);
```

### 5. Extraction Template (`src/templates/extraction-template.ts`)

Update prompt for content analysis instead of conversation analysis.

### 6. Handlers

Review and update:

- `TopicExtractionHandler` - may need changes or removal
- `TopicProcessingHandler` - should work as-is

## Implementation Order

1. Update config schema
2. Update topic source schema
3. Replace `TopicExtractor` methods
4. Update extraction template prompt
5. Add `shouldProcessEntityType()` helper
6. Change plugin subscriptions
7. Remove conversation extraction code
8. Update/remove handlers as needed
9. Add plugin tests and evals
10. Run typecheck

## Example Configurations

**Whitelist mode** - only extract from specific types:

```typescript
new TopicsPlugin({
  includeEntityTypes: ["post", "summary", "link"],
  minRelevanceScore: 0.5,
  autoMerge: true,
});
```

**Blacklist mode** - extract from all except specific types:

```typescript
new TopicsPlugin({
  excludeEntityTypes: ["profile", "deck"],
  minRelevanceScore: 0.5,
  autoMerge: true,
});
```

## Plugin Tests (`test/`)

### Unit Tests

**Config filtering** (`config.test.ts`):

- `shouldProcessEntityType` always skips topic type
- Whitelist mode includes only listed types
- Blacklist mode excludes listed types

**Topic extraction** (`topic-extractor.test.ts`):

- Extracts topics from entity content
- Sets correct source metadata (id, title, type)

### Integration Tests (`plugin.test.ts`):

- Extracts topics on `entity:created`
- Extracts topics on `entity:updated`
- Skips entity types not in whitelist
- Skips entity types in blacklist

## Plugin Evals (`evals/`)

Plugin-level evaluations that test extraction quality directly (not via chat).

### Eval Structure

```
plugins/topics/evals/
├── cases/
│   ├── blog-post-extraction.yaml
│   ├── link-extraction.yaml
│   └── multi-topic-content.yaml
├── fixtures/
│   └── sample-entities.ts
└── run-evals.ts
```

### Eval Case Schema

```yaml
id: blog-post-extraction
name: Extract topics from blog post
description: Tests that topics are correctly extracted from a blog post entity

input:
  entityType: post
  content: |
    # Introduction to Machine Learning

    Machine learning is a subset of artificial intelligence that enables
    systems to learn from data. Deep learning uses neural networks with
    multiple layers to process complex patterns.

    ## Key Concepts
    - Supervised learning
    - Unsupervised learning
    - Reinforcement learning
  metadata:
    title: "Introduction to Machine Learning"

expectedOutput:
  minTopics: 1
  maxTopics: 5
  topicsContain:
    - keyword: "machine learning"
    - keyword: "deep learning"
  sourceType: post
  minRelevanceScore: 0.5
```

### Eval Cases

**blog-post-extraction.yaml**

- Input: Blog post about a technical topic
- Expects: Topics extracted with relevant keywords, source type = "post"

**link-extraction.yaml**

- Input: Link entity with extracted web content
- Expects: Topics matching the linked content, source type = "link"

**multi-topic-content.yaml**

- Input: Long-form content covering multiple distinct topics
- Expects: Multiple separate topics, not one merged blob

**low-quality-content.yaml**

- Input: Short/vague content
- Expects: Few or no topics (respects minRelevanceScore)

**update-extraction.yaml**

- Input: Updated entity with new content
- Expects: New topics extracted, correctly attributed

### Eval Runner (`run-evals.ts`)

```typescript
// Run from plugin directory: bun run eval

interface EvalCase {
  id: string;
  name: string;
  input: {
    entityType: string;
    content: string;
    metadata: Record<string, unknown>;
  };
  expectedOutput: {
    minTopics?: number;
    maxTopics?: number;
    topicsContain?: Array<{ keyword: string }>;
    sourceType: string;
    minRelevanceScore?: number;
  };
}

async function runEval(evalCase: EvalCase): Promise<EvalResult> {
  const extractor = new TopicExtractor(context, logger);

  const entity = createEntity(evalCase.input);
  const topics = await extractor.extractFromEntity(
    entity,
    evalCase.expectedOutput.minRelevanceScore ?? 0.5,
  );

  return validateResults(topics, evalCase.expectedOutput);
}
```
