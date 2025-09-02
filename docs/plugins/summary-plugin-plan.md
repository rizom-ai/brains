# Summary Plugin Planning Document

## Overview

The Summary plugin provides intelligent, evolving conversation summaries by subscribing to the existing conversation digest events. It maintains one summary entity per conversation as a chronological log that updates contextually based on conversation flow.

## Core Design Principles

### 1. One Entity Per Conversation

- **Entity ID Format**: `summary-{conversationId}`
- **Single source of truth**: Entire conversation history in one entity
- **Simple queries**: Direct lookup by conversation ID
- **Git-friendly**: One file per conversation

### 2. Intelligent Log Management

When a digest event arrives (every 10 messages), the AI:

1. Retrieves the existing summary entity (if exists)
2. Analyzes the last 2-3 log entries for context
3. Decides whether to:
   - **Update** any of the last 3 entries if the topic continues
   - **Append** a new entry if it's a new topic/phase

### 3. Structured Markdown Storage

Content stored as readable markdown (not JSON):

```markdown
# Conversation Summary: {conversationId}

## Summary Log

### [2025-01-30T10:00:00Z - Updated 10:15:00Z] Project Architecture Discussion

Initial discussion about microservices vs monolith. Team evaluated different approaches
considering scalability, maintenance, and team expertise.

UPDATE: After further discussion, team decided on microservices approach due to
scalability requirements. Will start with 3 core services.

Key decision: Adopt microservices architecture with Kubernetes deployment.

### [2025-01-30T10:30:00Z] Budget Planning

Shifted to discussing Q1 budget allocation. Finance team presented constraints.
Need to balance infrastructure costs with hiring needs.

Action items identified:

- Prepare detailed infrastructure cost breakdown
- Submit headcount request for 2 senior engineers
```

## Implementation Architecture

### Entity Schema

```typescript
// Individual log entry
interface SummaryLogEntry {
  title: string; // Brief topic description
  content: string; // Summary text (includes all details)
  created: string; // ISO timestamp when created
  updated: string; // ISO timestamp when last updated
}

// Summary entity (one per conversation)
interface SummaryEntity {
  id: string; // Format: summary-{conversationId}
  entityType: "summary";
  content: string; // Structured markdown
  metadata: {
    conversationId: string;
    entryCount: number;
    totalMessages: number;
    lastUpdated: string;
  };
}
```

### Event Flow

1. **Digest Event Received** (from conversation service)
   - Contains 20-message window
   - Triggered every 10 messages
2. **Intelligent Processing**
   - Fetch existing summary entity
   - Extract last 2-3 log entries
   - Send to AI with new messages
3. **AI Decision**
   - Analyzes topic continuity
   - Decides: update existing entry or create new
   - Returns structured response
4. **Entity Update**
   - Update or append log entry
   - Save entity with new content
   - Update metadata

## AI Processing Logic

### Update vs New Entry Decision

The AI considers:

- Topic continuity between messages
- Time gaps between entries
- Participant changes
- Natural conversation boundaries

### Update Scenarios

- Same topic continues with new information
- Follow-up questions or clarifications
- Progressive decision making on same subject

### New Entry Scenarios

- Clear topic shift
- New participants join
- Significant time gap
- Different conversation phase (planning → execution)

## Commands & Tools

### Core Commands

- `summary:get <conversationId>` - Retrieve full summary
- `summary:list` - List all conversation summaries
- `summary:latest <conversationId>` - Get most recent entry
- `summary:search <query>` - Search across summaries

### MCP Tools

```typescript
tools: [
  {
    name: "summary:get",
    description: "Get summary for a conversation",
    inputSchema: {
      conversationId: z.string(),
    },
  },
  {
    name: "summary:search",
    description: "Search summaries",
    inputSchema: {
      query: z.string(),
      limit: z.number().optional(),
    },
  },
];
```

## File Structure

```
plugins/summary/
├── src/
│   ├── index.ts                    # Plugin class with digest subscription
│   ├── schemas/
│   │   └── summary.ts              # Entity and config schemas
│   ├── adapters/
│   │   └── summary-adapter.ts      # Markdown ↔ Entity conversion
│   ├── lib/
│   │   ├── summary-extractor.ts    # AI logic for summaries
│   │   └── summary-service.ts      # CRUD operations
│   ├── handlers/
│   │   └── digest-handler.ts       # Process digest events
│   ├── commands/
│   │   └── index.ts                # CLI commands
│   ├── tools/
│   │   └── index.ts                # MCP tools
│   └── templates/
│       ├── summary-list/           # List view template
│       └── summary-detail/         # Detail view template
└── test/
    └── *.test.ts                   # Tests
```

## Implementation Phases

### Phase 1: Core Functionality (Current)

- [x] Basic schema and adapter
- [ ] Digest event subscription
- [ ] Simple append-only summaries
- [ ] Basic commands

### Phase 2: Intelligent Updates

- [ ] AI decision logic for update vs append
- [ ] Multi-entry context consideration
- [ ] Smart topic detection

### Phase 3: Web Interface

- [ ] Summary list template
- [ ] Summary detail template
- [ ] Search interface

### Phase 4: Advanced Features (Future)

- [ ] Archival for very long conversations
- [ ] Cross-conversation summaries
- [ ] Export formats (PDF, Markdown)
- [ ] Summary compression for old entries

## Key Benefits

1. **Automatic**: No manual triggering needed
2. **Intelligent**: AI decides optimal organization
3. **Contextual**: Considers conversation flow
4. **Efficient**: Reuses existing digest infrastructure
5. **Readable**: Natural markdown format
6. **Scalable**: Archival strategy for long conversations (future)

## Testing Strategy

1. **Unit Tests**
   - Adapter markdown parsing/generation
   - Entry update logic
   - Schema validation

2. **Integration Tests**
   - Digest event handling
   - Entity creation/updates
   - AI decision making

3. **E2E Tests**
   - Full conversation summary flow
   - Multi-update scenarios
   - Search functionality

## Configuration

```typescript
interface SummaryConfig {
  enableAutoSummary: boolean; // Auto-process digest events (default: true)
  maxSummaryLength: number; // Max chars per entry (default: 500)
  contextEntries: number; // How many past entries to consider (default: 3)
}
```

## Success Metrics

- Summaries accurately reflect conversation flow
- Updates vs new entries feel natural
- File sizes remain manageable
- Users can quickly understand conversation history
- Search returns relevant results
