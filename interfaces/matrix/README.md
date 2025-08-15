# @brains/matrix

Matrix chat bot interface for Personal Brain applications.

## Overview

This package provides a Matrix bot interface that allows users to interact with their Brain through Matrix chat rooms. It supports E2E encryption, multiple rooms, and rich message formatting.

## Features

- Matrix bot with E2E encryption support
- Multi-room support
- Markdown message formatting
- Command execution
- Real-time progress updates
- Conversation memory
- Typing indicators
- Read receipts

## Installation

```bash
bun add @brains/matrix
```

## Setup

### Option 1: Using the Built-in Setup Utility

This package includes a setup utility to help create bot accounts:

```bash
# Install the package globally or use npx/bunx
bunx @brains/matrix brain-matrix-setup <homeserver> <username> <password>

# Example
MATRIX_ADMIN_TOKEN=syt_YWRtaW4_... bunx @brains/matrix brain-matrix-setup https://matrix.example.org brain-bot bot-password
```

The setup utility will:

1. Verify your admin token
2. Create a new Matrix account for your bot
3. Generate an access token
4. Output the configuration for your .env file

### Option 2: Manual Setup

1. Create a Matrix account for your bot manually
2. Get an access token using Element or another Matrix client
3. Configure environment variables

### Option 3: Programmatic Setup

```typescript
import { registerMatrixAccount } from "@brains/matrix";
import { Logger } from "@brains/utils";

const result = await registerMatrixAccount(
  {
    homeserver: "https://matrix.org",
    adminToken: process.env.MATRIX_ADMIN_TOKEN,
    username: "my-bot",
    password: "secure-password",
    displayName: "My Brain Bot",
  },
  logger,
);

console.log("Bot user ID:", result.user_id);
console.log("Access token:", result.access_token);
```

## Configuration

```typescript
interface MatrixConfig {
  homeserver: string; // Matrix homeserver URL
  userId: string; // Bot user ID (@bot:matrix.org)
  accessToken: string; // Bot access token
  autojoin?: boolean; // Auto-join invited rooms
  encryption?: boolean; // Enable E2E encryption
  rooms?: string[]; // Rooms to join on startup
}
```

### Environment Variables

```bash
MATRIX_HOMESERVER=https://matrix.org
MATRIX_USER_ID=@brain-bot:matrix.org
MATRIX_ACCESS_TOKEN=syt_YOUR_TOKEN_HERE
```

## Usage

### As a Plugin

```typescript
import { MatrixInterface } from "@brains/matrix";

const matrix = new MatrixInterface({
  homeserver: process.env.MATRIX_HOMESERVER,
  userId: process.env.MATRIX_USER_ID,
  accessToken: process.env.MATRIX_ACCESS_TOKEN,
});

// Register with shell
await shell.registerPlugin(matrix);
```

## Commands

Commands are auto-generated from plugin tools. Users can interact via:

```
!brain help                    # Show available commands
!brain create note "Title"      # Create a note
!brain search "query"           # Search entities
!brain status                   # Show system status
```

Or with natural language:

```
@brain-bot: Can you search for notes about TypeScript?
@brain-bot: Create a task to review the documentation
```

## Message Formatting

The bot supports rich markdown formatting:

- **Bold text**: `**text**`
- _Italic text_: `*text*`
- `Code`: `` `code` ``
- Code blocks with syntax highlighting
- Lists and nested lists
- Blockquotes
- Links

## Room Management

### Auto-join

The bot can auto-join rooms when invited:

```typescript
const matrix = new MatrixInterface({
  // ...
  autojoin: true,
});
```

### Specific Rooms

Configure specific rooms to join:

```typescript
const matrix = new MatrixInterface({
  // ...
  rooms: ["!roomid:matrix.org", "#brain:matrix.org"],
});
```

## Encryption

Enable E2E encryption (requires libolm):

```typescript
const matrix = new MatrixInterface({
  // ...
  encryption: true,
});
```

Note: The bot needs to be verified in encrypted rooms.

## Progress Updates

The bot shows real-time progress for long operations:

```
User: !brain import /path/to/files
Bot: Starting import...
Bot: 📊 Progress: [████████░░░░░░░░] 45% - Processing file 45/100
Bot: ✅ Import complete! Processed 100 files.
```

## Conversation Memory

Each room maintains its own conversation context:

```typescript
// Conversations are tracked per room
const conversation = await service.getOrCreateConversation("matrix", roomId);
```

## Event Handlers

The interface handles various Matrix events:

- Message events
- Membership changes
- Typing notifications
- Read receipts
- Room invites

## Security

### Access Control

Permissions are handled centrally by the PermissionService at the Shell level.
The Matrix interface no longer manages permissions directly. Configure user permissions
in your app's permission configuration.

### Command Validation

All commands are validated before execution:

- Input sanitization
- Permission checks
- Rate limiting

## Matrix Client

Uses the matrix-js-sdk:

```typescript
import { MatrixClient } from "@brains/matrix";

const client = new MatrixClient({
  homeserver,
  userId,
  accessToken,
});

await client.start();
await client.sendMessage(roomId, "Hello!");
```

## Testing

```typescript
import { MatrixInterface } from "@brains/matrix";
import { createMockMatrixClient } from "@brains/matrix/test";

const mockClient = createMockMatrixClient();
const matrix = new MatrixInterface({
  client: mockClient,
  // ... config
});

// Test message handling
await mockClient.emit("Room.timeline", {
  event: {
    type: "m.room.message",
    content: { body: "!brain help" },
  },
});
```

## Troubleshooting

### Setup Issues

#### Admin Token Errors

- Ensure your admin token has admin privileges on the homeserver
- The token must be from a user on the same server where you're creating accounts
- Check token format: should start with `syt_` for Synapse servers

#### Registration Failures

- "User already exists" - Choose a different username
- "Local users only" - Admin token is from a different server
- "Permission denied" - Token lacks admin privileges

### Bot not responding

- Check access token is valid
- Verify bot is in the room
- Check bot has permission to send messages

### E2E encryption issues

- Ensure libolm is installed
- Verify bot device is verified
- Check crypto store permissions

### Connection issues

- Verify homeserver URL
- Check network connectivity
- Review rate limits

## Exports

- `MatrixInterface` - Main interface plugin class
- `MatrixClient` - Matrix client wrapper
- `MarkdownFormatter` - Message formatter
- `registerMatrixAccount` - Bot account creation utility
- Configuration types and schemas
- Setup types: `MatrixRegistrationOptions`, `MatrixRegistrationResult`

## License

MIT
