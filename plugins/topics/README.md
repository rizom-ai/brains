# Topics Plugin

AI-powered topic extraction and management for Brain conversations.

## Overview

The Topics plugin analyzes conversations to automatically extract and track key topics being discussed. It uses AI to identify relevant themes, create summaries, and maintain a searchable knowledge base of topics.

## Features

- **AI-powered extraction**: Uses OpenAI/Claude to analyze conversations and extract topics
- **Topic deduplication**: Automatically merges similar topics to avoid redundancy
- **Relevance scoring**: Rates topics by importance (0-1 scale)
- **Keyword extraction**: Identifies key terms for each topic
- **Source tracking**: Links topics back to their conversation origins
- **Background processing**: Extraction runs as async jobs to avoid blocking

## Installation

The plugin is included in the Brain shell. Register it in your app configuration:

```typescript
import { TopicsPlugin } from "@brains/topics";

const plugin = new TopicsPlugin({
  windowSize: 50, // Messages to analyze per extraction
  minRelevanceScore: 0.5, // Minimum score to keep a topic
});
```

## Configuration

```typescript
interface TopicsPluginConfig {
  windowSize?: number; // Number of recent messages to analyze (default: 50)
  minRelevanceScore?: number; // Minimum relevance score 0-1 (default: 0.5)
}
```

## Commands

### Extract Topics

```bash
/topics:extract [--window <size>] [--min-score <score>]
```

Analyzes recent conversations and extracts topics. Runs as a background job.

### List Topics

```bash
/topics:list [--limit <n>] [--days <n>]
```

Lists all extracted topics, optionally filtered by time period.

### View Topic

```bash
/topics:view <topic-id>
```

Shows detailed information about a specific topic.

### Search Topics

```bash
/topics:search <query> [--limit <n>]
```

Searches topics by keywords or content.

### Merge Topics

```bash
/topics:merge <id1,id2,...> [--target <id>]
```

Merges duplicate topics into a single topic.

## MCP Tools

The plugin provides MCP tools for external clients:

- `topics:extract` - Queue topic extraction job
- `topics:list` - List all topics
- `topics:get` - Get specific topic details
- `topics:search` - Search topics
- `topics:merge` - Merge duplicate topics

## How It Works

1. **Extraction Process**:
   - Retrieves recent messages from all active conversations
   - Groups messages by conversation in sliding windows
   - Sends each window to AI for analysis
   - AI extracts topics with title, summary, keywords, and relevance score

2. **Topic Storage**:
   - Topics are stored as entities with type "topic"
   - Uses title as the unique ID for deduplication
   - Maintains metadata: keywords, relevance score, first/last seen, mention count

3. **Deduplication**:
   - When creating a topic, checks if one with the same title exists
   - If exists, merges new information (keywords, sources)
   - Updates relevance score to the maximum value

## Topic Entity Schema

Topics are stored as entities with this structure:

```typescript
interface TopicEntity extends BaseEntity {
  entityType: "topic";
  metadata: {
    keywords: string[];
    relevanceScore: number;
    firstSeen: Date;
    lastSeen: Date;
    mentionCount: number;
  };
}
```

The content body contains:

- Summary (2-3 sentences)
- Main content points
- Source references (conversation IDs and timestamps)

## Templates

The plugin uses the `topics:extraction` template to format AI prompts for consistent topic extraction. The template ensures structured output with all required fields.

## Background Jobs

Topic extraction runs as a background job (`topics:extraction`) to avoid blocking the UI. Jobs can be monitored through the job queue system.

## Development

### Testing

```bash
bun test plugins/topics
```

### Key Files

- `src/lib/topic-extractor.ts` - AI extraction logic
- `src/lib/topic-service.ts` - Topic CRUD operations
- `src/handlers/topic-extraction-handler.ts` - Background job handler
- `src/tools/index.ts` - MCP tool definitions
- `src/commands/index.ts` - CLI command handlers
