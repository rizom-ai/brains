# Conversation Context

The ConversationContext provides conversation management capabilities within the MCP architecture. It manages conversation storage, tiered memory, formatting, and exposes functionality through MCP resources and tools.

## Core Components

### ConversationContext

The main facade class that exposes conversation operations and manages all other components. It follows the singleton pattern to provide global access.

```typescript
// Get the singleton instance
const context = ConversationContext.getInstance();

// Or create a fresh instance for testing
const testContext = ConversationContext.createFresh({
  storage: new InMemoryStorage(),
});
```

### ConversationStorage

Interface defining storage operations for conversations, turns, and summaries. Implementations:

- **InMemoryStorage**: In-memory implementation for development/testing
- **(Future) SQLiteStorage**: Database-backed implementation using Drizzle ORM

```typescript
// Creating a conversation
const conversationId = await context.createConversation('cli', 'roomId');

// Adding turns
await context.addTurn(conversationId, 'User query', 'Assistant response', {
  userId: 'user-123',
  userName: 'User',
});

// Getting history
const history = await context.getConversationHistory(conversationId, {
  format: 'markdown',
  includeSummaries: true,
});
```

### TieredMemoryManager

Manages the tiered memory system with active, summary, and archive tiers to optimize token usage with long-running conversations.

```typescript
// Force summarization of older turns
await context.forceSummarize(conversationId);

// Get tiered history
const tieredHistory = await context.getTieredHistory(conversationId);
```

### ConversationFormatter

Formats conversations in different output formats (text, markdown, JSON, HTML) for display and export.

```typescript
// Format history for a prompt
const prompt = await context.formatHistoryForPrompt(conversationId);
```

## MCP Integration

ConversationContext exposes conversations through MCP resources and tools:

### Resources

- `conversations://list` - Lists all conversations
- `conversations://get/:id` - Get details of a specific conversation
- `conversations://search` - Search conversations by content
- `conversations://room/:roomId` - Get conversations associated with a specific room
- `conversations://recent` - Get most recent conversations

### Tools

- `create_conversation` - Creates a new conversation
- `add_turn` - Adds a turn to a conversation
- `summarize_conversation` - Forces summarization of a conversation
- `get_conversation_history` - Retrieves formatted conversation history
- `search_conversations` - Searches conversations

## Usage Example

```typescript
import { ConversationContext } from '@/contexts/conversations';

// Get the context instance
const conversationContext = ConversationContext.getInstance();

// Create a new conversation
const conversationId = await conversationContext.getOrCreateConversationForRoom(
  'room-123',
  'cli'
);

// Add a turn
await conversationContext.addTurn(
  conversationId,
  'What is the meaning of life?',
  '42'
);

// Get the conversation history for display
const history = await conversationContext.getConversationHistory(
  conversationId,
  { format: 'markdown' }
);

// Format history for prompt
const promptHistory = await conversationContext.formatHistoryForPrompt(
  conversationId
);
```

## Storage Migration

ConversationContext supports migrating data between storage implementations:

```typescript
// Migrate from in-memory to SQLite storage
const sqliteStorage = new SQLiteStorage('./brain.db');
await conversationContext.migrateStorage(sqliteStorage);
```