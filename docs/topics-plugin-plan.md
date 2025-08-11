# Topics Plugin Design Document

## Overview

The Topics Plugin provides AI-powered topic extraction, management, and analysis across all content sources in the Personal Brain system. Rather than being limited to conversations, this plugin creates a unified semantic layer that can derive topics from any content type.

## Motivation

Users accumulate knowledge from various sources:

- Conversations (Matrix, CLI, etc.)
- Notes and documents
- Web content and links
- Project files and code

The Topics Plugin unifies these into coherent topics that represent the user's actual areas of interest and knowledge, regardless of source.

## Architecture Decision

We chose to create a general **topics** plugin rather than a **conversation-summary** plugin because:

1. **Unified Knowledge Layer**: Topics should emerge from all content, not just conversations
2. **Better User Value**: Users care about insights and knowledge, not the source
3. **Future Flexibility**: Can easily extend to new content sources
4. **Architectural Alignment**: Fits naturally with the entity model where different content types are unified

## Phase 1: Core Implementation with Conversation Topics

### Directory Structure

```
plugins/topics/
├── src/
│   ├── plugin.ts                    # Main plugin class
│   ├── index.ts                     # Public exports
│   ├── types.ts                     # TypeScript interfaces
│   ├── schemas/
│   │   └── topic.ts                 # Topic entity schema
│   ├── lib/
│   │   ├── topic-extractor.ts      # AI-powered topic extraction
│   │   ├── topic-service.ts        # Topic management service
│   │   └── topic-merger.ts         # Topic deduplication/merging
│   ├── handlers/
│   │   ├── topic-extraction-job.ts # Async topic extraction
│   │   └── topic-merge-job.ts      # Async topic merging
│   ├── tools/
│   │   └── index.ts                 # Topic-related tools
│   └── templates/
│       └── topic-summary.ts        # Topic summary template
├── test/
│   ├── plugin.test.ts
│   ├── lib/
│   │   ├── topic-extractor.test.ts
│   │   └── topic-service.test.ts
│   └── handlers/
│       └── topic-extraction-job.test.ts
└── package.json
```

### Topic Entity Schema

Topics are stored as standard entities using the entity adapter pattern. Topic-specific data is stored in the entity metadata field.

```typescript
// Topic entity follows standard entity structure
interface TopicEntity extends BaseEntity {
  type: "topic";
  title: string; // Topic name
  body: string; // Markdown with summary, content, references sections
  metadata: TopicMetadata;
}

interface TopicMetadata {
  keywords: string[]; // Related keywords/tags
  relevanceScore: number; // Overall relevance/importance
  firstSeen: Date; // When topic first appeared
  lastSeen: Date; // Most recent mention
  mentionCount: number; // Total mentions across sources
  embedding?: number[]; // Vector for semantic search
}

// Source references are stored in the markdown body's references section
interface TopicSource {
  type: "conversation" | "note" | "document" | "link";
  id: string; // ID of source entity
  timestamp: Date; // When mentioned in source
  context?: string; // Surrounding context
}
```

### Core Services

#### TopicExtractor

- Uses AI to identify topics from text content
- Processes conversations using sliding window approach
- Extracts keywords and generates descriptions
- Calculates relevance scores
- Generates embeddings for semantic search
- Triggers on sliding time windows (e.g., last 24 hours of conversations)

#### TopicService

- CRUD operations for topics using entity adapter pattern
- Topic search and filtering
- Source reference management in markdown body
- Topic lifecycle management
- Stores topics as standard entities

#### TopicMerger

- Identifies similar topics using embedding similarity (threshold: 0.8)
- Automatically merges similar topics
- Preserves all source references in merged topic
- Updates relevance scores after merging

### Tools

1. **topics:extract**
   - Extract topics from recent conversations
   - Parameters: time range, minimum relevance score
   - Returns: list of extracted topics

2. **topics:list**
   - List all topics with filtering options
   - Parameters: date range, source type
   - Returns: paginated topic list

3. **topics:get**
   - Get detailed information for a topic
   - Parameters: topic ID, include sources
   - Returns: topic details with context

4. **topics:search**
   - Semantic search across topics
   - Parameters: query, similarity threshold
   - Returns: ranked topic matches

5. **topics:merge**
   - Manually merge similar topics
   - Parameters: topic IDs to merge
   - Returns: merged topic

### Integration Points

1. **ConversationService**: Read conversation history for topic extraction
2. **EntityService**: Store topics as entities
3. **AIService**: Generate summaries and extract topics
4. **EmbeddingService**: Create and search embeddings
5. **JobQueue**: Handle async extraction and merging

### Implementation Steps (Phase 1 - MVP)

1. Create plugin structure and basic setup
2. Implement Topic entity adapter with standard entity pattern
3. Build basic TopicExtractor (without AI initially)
4. Create TopicService for CRUD operations
5. Add extraction job handler with sliding window
6. Implement topics:extract and topics:list tools
7. Create tests for all components

### Implementation Steps (Phase 1 - Complete)

8. Integrate AI service for topic extraction
9. Add embedding generation and storage
10. Implement topics:search with semantic search
11. Build TopicMerger with similarity threshold
12. Add topics:merge tool
13. Implement automatic merging in job handler
14. Add topics:get tool for detailed view

## Phase 2: Extended Sources (Future)

### Additional Extractors

- **NoteTopicExtractor**: Extract from note entities
- **DocumentTopicExtractor**: Extract from documents
- **LinkTopicExtractor**: Extract from web content

### Cross-Source Features

- Topic correlation across different sources
- Topic evolution tracking over time
- Topic hierarchies and relationships
- Automatic topic categorization

### Advanced Analytics

- Topic trends and frequency analysis
- User interest profiling based on topics
- Topic-based content recommendations
- Knowledge gap identification

## Phase 3: Advanced Features (Future)

### Semantic Capabilities

- Topic ontology building
- Concept mapping
- Knowledge graph generation
- Semantic reasoning

### Collaboration Features

- Shared topics across users
- Topic-based expertise matching
- Collaborative topic curation

## Benefits

1. **Unified Knowledge**: All content contributes to a single knowledge layer
2. **Better Discovery**: Find related content across all sources
3. **Insights**: Understand patterns in interests and knowledge
4. **Semantic Search**: Find information by concept, not just keywords
5. **Extensibility**: Easy to add new content sources

## Success Metrics

- Number of topics extracted and managed
- Cross-source topic correlations found
- Search relevance improvements
- User engagement with topic features
- Reduction in duplicate information

## Technical Considerations

### Performance

- Batch processing for large conversation histories
- Incremental extraction for new content
- Caching for frequently accessed topics
- Efficient embedding storage and search

### Data Management

- Topic lifecycle (creation, merging, archival)
- Source reference integrity
- Privacy considerations for topic data
- Export/import capabilities

### AI Optimization

- Prompt engineering for accurate extraction
- Model selection for different content types
- Confidence scoring calibration
- Handling ambiguous topics

## Migration Path

For users with existing conversation-memory data:

1. Run extraction job on historical conversations
2. Generate initial topic set
3. Allow manual curation and merging
4. Enable automatic extraction for new content

## Testing Strategy

1. Unit tests for extractors and services
2. Integration tests with mock AI service
3. End-to-end tests with sample conversations
4. Performance tests for large datasets
5. Accuracy tests for topic extraction

## Conclusion

The Topics Plugin provides a powerful semantic layer that unifies knowledge from all content sources. Starting with conversations in Phase 1, it establishes the foundation for a comprehensive knowledge management system that grows more valuable as more content sources are added.
