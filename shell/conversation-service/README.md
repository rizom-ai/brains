# @brains/conversation-service

Conversation and message management service for Brain applications.

## Overview

This service provides conversation tracking and message storage, enabling memory and context awareness across different interfaces.

## Features

- Conversation management by session/conversation, interface, and channel
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
const conversationId = await service.startConversation({
  sessionId: "cli-main",
  interfaceType: "cli",
  channelId: "main",
  metadata: {
    channelName: "Main CLI",
    interfaceType: "cli",
    channelId: "main",
  },
});

// Add message
await service.addMessage({
  conversationId,
  role: "user",
  content: "Hello, Brain!",
});

// Get recent messages
const messages = await service.getMessages(conversationId, { limit: 20 });

// Get conversation metadata
const conv = await service.getConversation(conversationId);
```

## Conversation vs channel scope

`conversationId` identifies the persisted transcript/session. Use it for
conversation-scoped reads and writes, including message history, conversation
memory, and access checks for artifacts referenced from prior messages.

`channelId` identifies the transport routing destination, such as a Discord or
Matrix channel/room. Some interfaces, including web chat, may use the same value
for both fields, but runtime code should not rely on that coincidence. When a
legacy call path only provides `channelId`, conversation-scoped code may fall
back to it for backward compatibility.

## Schema

### Conversations Table

- `id` - Unique identifier
- `interfaceType` - Interface type (cli, matrix, mcp)
- `channelId` - Transport channel identifier; may equal `id` for single-session interfaces
- `created` - Creation timestamp
- `lastActive` - Last activity timestamp

### Messages Table

- `id` - Message ID
- `conversationId` - Parent conversation
- `role` - Message role (user, assistant, system)
- `content` - Message content
- `timestamp` - Message timestamp

## License

Apache-2.0
