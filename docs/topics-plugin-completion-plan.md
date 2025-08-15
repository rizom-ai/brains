# Topics Plugin Completion Plan

## Overview

Complete the Topics plugin with AI-powered automatic conversation topic extraction using sliding windows.

## Core Decisions

### Extraction Parameters

- **Window size**: 30 messages
- **Slide interval**: 20 messages (10 message overlap)
- **Bootstrap**: First extraction at 10 messages
- **Auto-trigger**: Every 20 new messages after bootstrap

### Extraction Schedule Example

```
Messages 1-10:   First extraction (bootstrap)
Messages 1-30:   Second extraction (at 30 total messages)
Messages 21-50:  Third extraction (at 50 total messages)
Messages 41-70:  Fourth extraction (at 70 total messages)
... continues sliding by 20
```

### Topic Management (Simplified)

- **AI-powered merging**: Let AI decide what should be merged
- **Storage**: Sources in body (markdown), conversation IDs in metadata (for indexing)
- **No topic limit** (can be added later)

## Implementation Plan

### Phase 1: Sliding Window Extraction & Entity Creation (Week 1)

#### 1.1 Extraction and Topic Creation Flow

```typescript
class TopicExtractionHandler {
  async handle(job: Job): Promise<void> {
    const { conversationId, startIdx, endIdx } = job.data;

    // Step 1: Extract topics using AI
    const extractedTopics = await this.extractFromWindow(
      conversationId,
      startIdx,
      endIdx,
    );

    // Step 2: For each extracted topic, create or update entity
    for (const extracted of extractedTopics) {
      await this.createOrUpdateTopicEntity(extracted, conversationId);
    }
  }

  private async extractFromWindow(
    conversationId: string,
    startIdx: number,
    endIdx: number,
  ): Promise<ExtractedTopic[]> {
    const messages = await context.getMessages(
      conversationId,
      startIdx,
      endIdx,
    );

    // Use existing AI extraction
    const result = await context.generateContent({
      prompt: `Extract key topics from this conversation window...`,
      templateName: "topics:extraction",
    });

    return result.topics;
  }

  private async createOrUpdateTopicEntity(
    extracted: ExtractedTopic,
    conversationId: string,
  ): Promise<void> {
    // Check if topic already exists (by title/similarity)
    const existing = await this.findSimilarTopic(extracted);

    if (existing) {
      // Ask AI if we should merge
      const shouldMerge = await this.askAIShouldMerge(extracted, existing);

      if (shouldMerge) {
        // Update existing topic entity
        await this.mergeIntoExistingTopic(existing, extracted, conversationId);
      } else {
        // Create new topic entity
        await this.createNewTopicEntity(extracted, conversationId);
      }
    } else {
      // Create new topic entity
      await this.createNewTopicEntity(extracted, conversationId);
    }
  }
}
```

#### 1.2 Creating Topic Entities

```typescript
private async createNewTopicEntity(
  extracted: ExtractedTopic,
  conversationId: string
): Promise<TopicEntity> {
  const now = new Date();

  // Create entity with proper structure
  const entity = await entityService.createEntity({
    id: slugify(extracted.title), // Create ID from title
    entityType: "topic",
    content: this.formatTopicContent(extracted),
    metadata: {
      keywords: extracted.keywords,
      relevanceScore: extracted.relevanceScore,
      conversationIds: [conversationId],
      firstSeen: now,
      lastSeen: now,
      mentionCount: 1,
    },
  });

  return entity;
}

private formatTopicContent(extracted: ExtractedTopic): string {
  return `# ${extracted.title}

## Summary
${extracted.summary}

## Key Points
${extracted.content}

## Keywords
${extracted.keywords.join(", ")}

## Sources
${extracted.sources.map(s =>
  `- Conversation ${s.conversationId} at ${s.timestamp}`
).join("\n")}

---
*Relevance Score: ${extracted.relevanceScore}*
`;
}
```

#### 1.3 Merging into Existing Topics

```typescript
private async mergeIntoExistingTopic(
  existing: TopicEntity,
  extracted: ExtractedTopic,
  conversationId: string
): Promise<TopicEntity> {
  // Ask AI to merge content intelligently
  const merged = await context.generateContent({
    prompt: `Merge this new information into the existing topic:

      Existing topic:
      ${existing.content}

      New information:
      Title: ${extracted.title}
      Summary: ${extracted.summary}
      Content: ${extracted.content}

      Create updated content that integrates the new information smoothly.`,
    templateName: "topics:merge-content",
  });

  // Update the existing topic entity
  const updated = await entityService.updateEntity(existing.id, {
    content: merged.content,
    metadata: {
      ...existing.metadata,
      keywords: [...new Set([...existing.metadata.keywords, ...extracted.keywords])],
      conversationIds: [...new Set([...existing.metadata.conversationIds, conversationId])],
      relevanceScore: Math.max(existing.metadata.relevanceScore, extracted.relevanceScore),
      lastSeen: new Date(),
      mentionCount: existing.metadata.mentionCount + 1,
    },
  });

  return updated;
}
```

### Phase 2: AI-Powered Topic Similarity (Week 1)

#### 2.1 Finding Similar Topics

```typescript
private async findSimilarTopic(extracted: ExtractedTopic): Promise<TopicEntity | null> {
  // First try exact title match
  const exactId = slugify(extracted.title);
  try {
    const exact = await entityService.getEntity("topic", exactId);
    if (exact) return exact;
  } catch (error) {
    // Not found, continue
  }

  // Get all existing topics
  const allTopics = await entityService.listEntities({
    entityType: "topic",
    limit: 1000, // Get all topics
  });

  if (allTopics.length === 0) return null;

  // Ask AI to find similar topics
  const result = await context.generateContent({
    prompt: `Is this new topic similar to any existing topics?

      New topic:
      Title: ${extracted.title}
      Keywords: ${extracted.keywords.join(", ")}
      Summary: ${extracted.summary}

      Existing topics: ${JSON.stringify(allTopics.map(t => ({
        id: t.id,
        keywords: t.metadata.keywords.join(", "),
        summary: t.content.split('\n')[4], // Extract summary from content
      })))}

      If there's a similar topic (similarity > 0.8), return its ID.
      Otherwise return null.

      Consider topics similar if they:
      - Cover the same subject matter
      - Share significant keywords
      - Would benefit from being combined`,
    templateName: "topics:find-similar",
  });

  if (result.similarTopicId) {
    return await entityService.getEntity("topic", result.similarTopicId);
  }

  return null;
}
```

#### 2.2 AI Templates

```typescript
// Register templates in plugin
context.registerTemplates({
  "topics:find-similar": {
    schema: z.object({
      similarTopicId: z.string().nullable(),
      similarity: z.number().min(0).max(1).optional(),
      reason: z.string().optional(),
    }),
    systemPrompt: "You are an expert at identifying similar topics.",
  },

  "topics:merge-content": {
    schema: z.object({
      content: z.string(),
      keywords: z.array(z.string()),
    }),
    systemPrompt:
      "You are an expert at merging topic information while maintaining clarity.",
  },

  "topics:should-merge": {
    schema: z.object({
      shouldMerge: z.boolean(),
      reason: z.string(),
    }),
    systemPrompt: "Determine if topics are similar enough to merge.",
  },
});
```

### Phase 3: Auto-Trigger Implementation (Week 1)

#### 3.1 Conversation State Tracking

```typescript
// Store extraction state in conversation metadata or separate service
interface ExtractionState {
  conversationId: string;
  messageCount: number;
  bootstrapped: boolean;
  nextExtractionAt: number;
  lastExtractedAt?: number;
}
```

#### 3.2 Message Event Listener

```typescript
// In TopicsPlugin.onRegister()
context.on("conversation:message", async (event) => {
  if (!this.config.autoExtract) return;

  const state = await this.getOrCreateExtractionState(event.conversationId);
  state.messageCount++;

  if (state.messageCount === 10 && !state.bootstrapped) {
    // Bootstrap: first extraction at 10 messages
    await context.enqueueJob("topics:extraction", {
      conversationId: event.conversationId,
      startIdx: 1,
      endIdx: 10,
    });
    state.bootstrapped = true;
    state.nextExtractionAt = 30; // Next at 30 messages
  } else if (state.messageCount >= state.nextExtractionAt) {
    // Regular extraction with sliding window
    const endIdx = state.messageCount;
    const startIdx = Math.max(1, endIdx - 29); // 30 message window

    await context.enqueueJob("topics:extraction", {
      conversationId: event.conversationId,
      startIdx,
      endIdx,
    });

    state.lastExtractedAt = state.messageCount;
    state.nextExtractionAt = state.messageCount + 20;
  }

  await this.saveExtractionState(state);
});
```

### Phase 4: Manual Controls (Week 2)

#### 4.1 Manual Extraction Command

```typescript
commands.push({
  name: "topics:extract-now",
  description: "Force topic extraction from a conversation",
  handler: async (args) => {
    const conversationId = args[0];
    if (!conversationId) {
      return { error: "Please provide a conversation ID" };
    }

    const messages = await context.getMessages(conversationId);

    // Extract from last 30 messages or all if less
    const endIdx = messages.length;
    const startIdx = Math.max(1, endIdx - 29);

    const jobId = await context.enqueueJob("topics:extraction", {
      conversationId,
      startIdx,
      endIdx,
    });

    return {
      message: `Extraction queued for messages ${startIdx}-${endIdx}`,
      jobId,
    };
  },
});
```

#### 4.2 List Topics by Conversation

```typescript
commands.push({
  name: "topics:by-conversation",
  description: "List topics from a specific conversation",
  handler: async (args) => {
    const conversationId = args[0];

    // Find all topics that include this conversation
    const allTopics = await entityService.listEntities({
      entityType: "topic",
    });

    const relevantTopics = allTopics.filter((topic) =>
      topic.metadata.conversationIds?.includes(conversationId),
    );

    return {
      topics: relevantTopics.map((t) => ({
        id: t.id,
        keywords: t.metadata.keywords,
        relevanceScore: t.metadata.relevanceScore,
        mentionCount: t.metadata.mentionCount,
      })),
    };
  },
});
```

## Configuration

```typescript
interface TopicsPluginConfig {
  // Extraction settings
  windowSize: number; // Default: 30
  bootstrapSize: number; // Default: 10
  slideInterval: number; // Default: 20

  // AI settings
  minRelevanceScore: number; // Default: 0.5
  mergeSimilarityThreshold: number; // Default: 0.8

  // Automation
  autoExtract: boolean; // Default: true
  autoMerge: boolean; // Default: true
}
```

## Testing Strategy

### What to Test

Focus on deterministic, testable logic only:

1. **Unit Tests** (worth doing):
   - Topic ID generation (slugify function)
   - Content markdown formatting
   - State calculation (when to trigger extraction)
   - Message index calculations for sliding windows

2. **Manual Testing** (most valuable):
   - Create real conversation with 50+ messages
   - Observe actual AI topic extraction quality
   - Verify extractions trigger at correct intervals (10, 30, 50 messages)
   - Test topic merging with real AI decisions
   - Tune prompts based on actual results
   - Test manual extraction command

### What NOT to Test

Skip integration tests that would require extensive mocking:

- AI responses (non-deterministic)
- Full extraction flow (mostly glue code)
- Entity service interactions (already tested elsewhere)
- Event handling (simple pass-through)

### Development Approach

1. Implement with real services
2. Test manually with actual conversations
3. Add logging to observe behavior
4. Iterate on prompts based on results
5. Only add unit tests for pure logic functions

## Future Enhancements (Not in MVP)

- Topic limits and cleanup
- Topic statistics and trends
- Extract from other entity types (notes, articles)
- Topic relationships and hierarchy
- Browse entities by topic

## Success Metrics

1. **Automatic extraction**: Works reliably on new messages
2. **Topic quality**: AI creates coherent, useful topics
3. **Deduplication**: Similar topics are merged effectively
4. **Performance**: Extraction completes in < 3 seconds
5. **Storage**: Topics properly stored as entities with metadata
