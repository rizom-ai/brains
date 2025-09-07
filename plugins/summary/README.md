# Summary Plugin

AI-powered conversation summarization plugin for the Personal Brain system.

## Overview

The Summary plugin automatically creates and maintains intelligent summaries of conversations. It subscribes to conversation digest events and maintains one evolving summary entity per conversation, updating contextually as the conversation progresses.

## Features

- **Automatic Summarization**: Subscribes to conversation digest events (every 10 messages)
- **Intelligent Updates**: AI decides whether to update existing entries or add new ones
- **Structured Storage**: Chronological log format with timestamps and topics
- **One Entity Per Conversation**: Simple `summary-{conversationId}` format
- **Matrix Integration**: Special handling for Matrix room conversations
- **Daily Digests**: Generate daily summaries across all conversations

## Tools

### `summary:get`

Get the summary for a specific conversation.

**Parameters:**
- `conversationId` (string, required): The conversation to summarize

**Returns:**
- Summary entity with chronological log entries

### `summary:list`

List all conversation summaries.

**Parameters:**
- `limit` (number, optional, default: 10): Maximum number of summaries

**Returns:**
- Array of summary entities with metadata

### `summary:digest`

Generate a daily digest of all conversations.

**Parameters:**
- `date` (string, optional): Date for digest (defaults to today)

**Returns:**
- Combined summary of all conversations for the day

### `summary:search`

Search through conversation summaries.

**Parameters:**
- `query` (string, required): Search query
- `limit` (number, optional, default: 20): Maximum results

**Returns:**
- Matching summary entries

## How It Works

### Automatic Summarization Flow

1. **Digest Event**: Triggered every 10 messages in a conversation
2. **Context Analysis**: AI reviews the last 2-3 summary entries
3. **Smart Decision**: 
   - **Update** if the topic continues (last 3 entries)
   - **Append** if it's a new topic or phase
4. **Storage**: Saves as markdown entity with structured sections

### Summary Format

```markdown
# Summary: Project Planning Discussion

## Metadata
- Conversation: conv_abc123
- Last Updated: 2024-01-15T14:30:00Z
- Message Count: 47

## Log

### 2024-01-15T10:00:00Z - Project Kickoff
Participants: Alice, Bob
- Discussed initial project requirements
- Set timeline for Q1 delivery
- Assigned roles: Alice (frontend), Bob (backend)

### 2024-01-15T11:30:00Z - Technical Architecture (Updated)
Participants: Alice, Bob, Charlie
- Reviewed tech stack options
- Decided on React + Node.js + PostgreSQL
- Charlie joined to discuss DevOps setup
- Added CI/CD pipeline requirements
```

## Configuration

```typescript
{
  maxLogEntries: 50,        // Maximum entries per summary
  updateWindow: 3,          // How many recent entries AI can update
  enableDailyDigest: true,  // Auto-generate daily digests
  digestTime: "09:00"       // Time to generate daily digest
}
```

## Architecture

The plugin follows the established patterns:

- **SummaryAdapter**: Entity adapter for summary formatting
- **SummaryService**: Core business logic
- **DigestHandler**: Handles conversation digest events
- **DataSource**: Provides summary data to other plugins

## Usage

The plugin works automatically once registered:

```typescript
import { createSummaryPlugin } from "@brains/summary";

const summaryPlugin = createSummaryPlugin({
  maxLogEntries: 50,
  enableDailyDigest: true
});

// Summaries are created automatically as conversations happen
// Access them through tools or directly via entity service
```

## Integration

### With Matrix

For Matrix rooms, summaries include:
- Room name and participants
- Formatted messages with proper attribution
- Threaded conversation tracking

### With Site Builder

Summary entities are automatically available for display on generated sites through the DataSource interface.

## Benefits

1. **Automatic Memory**: No manual summarization needed
2. **Context Preservation**: Maintains conversation flow
3. **Efficient Storage**: One file per conversation
4. **Smart Updates**: Reduces redundancy through intelligent editing
5. **Searchable**: Full-text search across all summaries