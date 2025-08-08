# Topical Conversation Summarization Plan

## Overview

Transform conversation memory from chronological summaries to a topic-based knowledge system where topics are global entities that accumulate knowledge across all interactions.

## Core Design Decisions

### 1. Global Topics (Not Bound to Conversations)

- Topics exist independently of conversations, sessions, or users
- Each topic is a knowledge entity that grows over time
- Metadata tracks contributors (sessions, users, interfaces)
- Topics remain active indefinitely (no archiving based on age)

### 2. Embedding-Based Topic Matching

- Generate embeddings for each message batch
- Compare to existing topic embeddings using vector storage
- Configurable similarity threshold (default 0.7) for matching
- Create new topic if no match found

### 3. Independent Topic Updates

- Each topic can be updated separately
- AI intelligently merges new content with existing summaries
- No need to regenerate all summaries
- Focus on actionable information over chronological narrative

### 4. Rich Topic Metadata

- **title**: Auto-generated descriptive title
- **contributors**: Track which sessions/users/interfaces contributed
- **entities**: Extract people, projects, technologies mentioned
- **messageIds**: Track source messages for auditability
- **messageCount**: Number of messages in this topic
- **firstCreated**: When topic was first created
- **lastUpdated**: Most recent update timestamp

## Implementation Architecture

### Entity Structure

```typescript
// Entity type: "conversation-topic"
interface ConversationTopic extends BaseEntity {
  entityType: "conversation-topic";
  title: string; // Auto-generated
  content: string; // The summarized content with key takeaways section
  metadata: {
    contributors: {
      sessions: string[];
      users: string[];
      interfaces: string[];
    };
    entities: {
      people: string[];
      projects: string[];
      technologies: string[];
    };
    messageIds: string[]; // Source messages for traceability
    messageCount: number;
    firstCreated: string;
    lastUpdated: string;
    // Embedding stored in entity service's vector_data table
  };
}
```

### Key Functions

1. **Topic Discovery**

   ```typescript
   findOrCreateTopic(message: Message): Promise<TopicId>
   ```

   - Generate embedding for message
   - Search existing topics by embedding similarity
   - Return matching topic or create new one

2. **Topic Update**

   ```typescript
   updateTopic(topicId: string, newContent: string, metadata: UpdateMetadata): Promise<void>
   ```

   - Retrieve existing topic
   - Use AI to merge new content intelligently
   - Update metadata (contributors, entities, timestamps)

3. **Title Generation**
   ```typescript
   generateTopicTitle(content: string): Promise<string>
   ```

   - Use AI to generate descriptive title
   - Update as topic evolves

### Summarization Flow

1. **Batch Processing**
   - Process messages in configurable batches (default 20 messages)
   - Use sliding window with configurable overlap (default 25%)
   - Track last processed message ID for continuity
   - Process all messages at once for topic clustering

2. **Topic Clustering**
   - Group messages by semantic similarity
   - Only create/update topics if grouped content is substantial
   - Use similarity threshold to control topic proliferation
   - No hard limit on topics per batch

3. **For Each Topic Cluster**
   - Find or create topic (using embeddings)
   - Check for duplicate processing (via messageIds)
   - Prepare content for AI summarization
   - Update topic with merged summary

4. **AI Integration**
   - Prioritize actionable information (decisions, solutions, tasks, learnings)
   - Include "Key Takeaways" section at beginning of summary
   - Target length: 300-500 words (configurable, max 1000)
   - Generate/update descriptive topic title
   - Extract key entities (people, projects, technologies)
   - Merge new information intelligently with existing content

### Storage Approach

- Topics stored as entities (type: "conversation-topic")
- Use entity service's built-in vector storage for embeddings
- Leverage existing search and similarity capabilities
- Message IDs tracked in topic metadata for auditability
- Summary tracking table maintains processing state

### Search Enhancement

- Search returns relevant topics instead of conversation snippets
- Topics provide richer context with accumulated knowledge
- Can search by entity mentions, contributors, or content

## Benefits

1. **Knowledge Persistence**: Information persists across conversations
2. **Better Discovery**: Find related discussions easily
3. **Automatic Knowledge Base**: Self-organizing information
4. **Cross-Context Learning**: Ideas connect across different sessions
5. **Scalability**: Topics grow incrementally without full regeneration

## Configuration

```typescript
interface TopicSummarizationConfig {
  summarization: {
    minMessages: number;          // Default: 20
    minTimeMinutes: number;       // Default: 60
    enableAutomatic: boolean;     // Default: true
    batchSize: number;           // Default: 20
    overlapPercentage: number;   // Default: 0.25 (25%)
    similarityThreshold: number; // Default: 0.7
    targetLength: number;        // Default: 400 words
    maxLength: number;          // Default: 1000 words
  };
}
```

## Job Execution

- Jobs triggered by message thresholds or time intervals
- No self-queuing (explicit triggers only)
- Sliding window ensures continuity between runs
- Tracks last processed message for each conversation

## Migration Path

1. Start with new conversations (no migration needed)
2. Existing conversations continue to work
3. Can optionally process old conversations to extract topics

## Future Enhancements

- Topic merging (when similarity threshold improvements aren't enough)
- Topic splitting (divide topics that have grown too broad)
- Topic hierarchies (parent/child relationships)
- Topic versioning (track how topics evolve)
- Topic recommendations (suggest related topics)
