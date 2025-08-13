# @brains/conversation-service

Conversation and message management service for Personal Brain applications.

## Overview

This service provides conversation tracking and message storage, enabling memory and context awareness across different interfaces.

## Features

- Conversation management by interface and channel
- Message storage with role tracking
- Conversation context retrieval
- Memory tools for MCP
- SQLite persistence

## Usage

```typescript
import { ConversationService } from "@brains/conversation-service";

const service = ConversationService.getInstance({
  database: db,
});

// Get or create conversation
const conversation = await service.getOrCreateConversation("cli", "main");

// Add message
await service.addMessage(conversation.id, {
  role: "user",
  content: "Hello, Brain!",
});

// Get recent messages
const messages = await service.getMessages(
  conversation.id,
  20, // limit
);

// Get conversation metadata
const conv = await service.getConversation(conversationId);
```

## Schema

### Conversations Table

- `id` - Unique identifier
- `interfaceType` - Interface type (cli, matrix, mcp)
- `channelId` - Channel identifier
- `created` - Creation timestamp
- `lastActive` - Last activity timestamp

### Messages Table

- `id` - Message ID
- `conversationId` - Parent conversation
- `role` - Message role (user, assistant, system)
- `content` - Message content
- `timestamp` - Message timestamp

## License

MIT
