# Matrix Interface Implementation Plan - Full-Featured Bot

## Overview
Create a comprehensive Matrix interface that provides a rich, interactive experience with all essential bot features including E2E encryption, reactions, threading, and file sharing.

## Core Features

### 1. Authentication & Setup
- **Access Token Authentication** - Users provide a long-lived access token
- **Device Management** - Proper device ID handling for E2E encryption
- **Auto-join Rooms** - Automatically accept room invites
- **Homeserver Discovery** - Support well-known delegation

### 2. Message Handling
- **Text Messages** - Full markdown support with proper HTML rendering
- **Typing Indicators** - Show when bot is processing
- **Reactions** - Add 🤔 when thinking, ✅ when done
- **Threading** - Support Matrix threads for conversations
- **Edits** - Handle message edits gracefully
- **Replies** - Properly thread replies to maintain context

### 3. E2E Encryption
- **Rust Crypto SDK** - Use matrix-bot-sdk's Rust crypto for performance
- **Key Management** - Secure storage of encryption keys
- **Device Verification** - Support cross-signing (future enhancement)
- **Fallback** - Graceful degradation if crypto fails

### 4. Rich Content
- **File Uploads** - Share generated documents, images
- **Code Blocks** - Syntax highlighted code snippets
- **Tables** - Properly formatted markdown tables
- **Lists** - Nested lists with proper formatting
- **Quotes** - Block quotes for citations

### 5. Room Management
- **Per-Room Settings** - Different behavior per room
- **Room State** - Track conversation context per room
- **Permissions** - Respect power levels and permissions
- **Room Types** - Different behavior for DMs vs rooms

### 6. User Experience
- **Command Shortcuts** - Quick commands like !help, !search
- **Natural Language** - No need for special syntax
- **Context Awareness** - Remember recent conversations
- **Error Messages** - User-friendly error handling
- **Help System** - Interactive help with examples

### 7. Permission System
- **Anchor User** - Primary user with full tool access
- **Trusted Users** - Intermediate access to safe tools  
- **Public Users** - Limited to read-only and safe operations
- **Per-Tool Visibility** - Tools declare their access level at registration
- **Context-Aware Filtering** - QueryProcessor filters tools based on user permissions

## Technical Architecture

### Package Structure
```
packages/matrix/
├── src/
│   ├── index.ts              # Package exports
│   ├── matrix-interface.ts   # Main interface class
│   ├── client/
│   │   ├── matrix-client.ts  # Client wrapper
│   │   ├── crypto.ts         # E2E encryption setup
│   │   └── storage.ts        # State persistence
│   ├── handlers/
│   │   ├── message.ts        # Message event handler
│   │   ├── room.ts           # Room event handler
│   │   ├── reaction.ts       # Reaction handler
│   │   └── typing.ts         # Typing indicator
│   ├── formatters/
│   │   ├── markdown.ts       # Markdown to Matrix HTML
│   │   ├── code.ts           # Code block formatting
│   │   └── media.ts          # File/image handling
│   ├── features/
│   │   ├── threading.ts      # Thread management
│   │   ├── commands.ts       # Command parsing
│   │   ├── context.ts        # Conversation context
│   │   └── permissions.ts    # Permission checking
│   └── types.ts              # TypeScript definitions
├── test/
│   ├── unit/                 # Unit tests
│   ├── integration/          # Integration tests
│   └── fixtures/             # Test fixtures
├── package.json
├── tsconfig.json
└── README.md
```

### Key Classes

```typescript
// Main interface
export class MatrixInterface extends BaseInterface {
  private client: MatrixClient;
  private crypto: CryptoManager;
  private contextManager: ContextManager;
  private reactionHandler: ReactionHandler;
  private permissionHandler: PermissionHandler;
  
  async start(): Promise<void>;
  async stop(): Promise<void>;
  protected handleLocalCommand(): Promise<string | null>;
}

// Context manager for conversation state
export class ContextManager {
  private roomContexts: Map<string, RoomContext>;
  
  getContext(roomId: string): RoomContext;
  updateContext(roomId: string, message: string): void;
  clearContext(roomId: string): void;
}

// Reaction feedback system
export class ReactionHandler {
  async addThinking(roomId: string, eventId: string): Promise<void>;
  async addComplete(roomId: string, eventId: string): Promise<void>;
  async removeReaction(roomId: string, eventId: string, key: string): Promise<void>;
}

// Permission management
export class PermissionHandler {
  constructor(anchorUserId: string, trustedUsers?: string[]);
  getUserPermissionLevel(userId: string): "anchor" | "trusted" | "public";
  canUseCommand(userId: string, command: string): boolean;
  filterToolsByPermission(tools: Tool[], userId: string): Tool[];
}
```

## Implementation Phases

### Phase 1: Core Setup & Permission Foundation (Week 1)
1. Create matrix package structure
2. Implement basic MatrixClient wrapper
3. Set up authentication and connection
4. Basic message send/receive
5. Markdown formatting
6. **Permission system foundation** - Build PermissionHandler from the start

### Phase 2: Public Features (Week 2)
**Features available to everyone:**
1. Natural language queries
2. Search functionality
3. Read-only operations
4. Help and documentation
5. Basic Q&A interactions

**Public Tools:**
- `search` - Search notes and knowledge base
- `list` - List available content
- `help` - Get help on using the bot
- `explain` - Get explanations of concepts
- `summarize` - Summarize content

### Phase 3: Anchor-Only Features (Week 3)
**Features restricted to anchor user:**
1. Create/Update/Delete operations
2. File system access
3. Git operations
4. Content generation
5. System configuration

**Anchor Tools:**
- `create_note` - Create new notes
- `update_note` - Modify existing notes
- `delete` - Remove content
- `generate_content` - AI content generation
- `git_sync` - Sync with git repository
- `regenerate_site` - Rebuild website
- `configure` - Change system settings

### Phase 4: Rich Interaction Features (Week 4)
1. Typing indicators
2. Reaction system (🤔 while thinking, ✅ when done)
3. Threading support
4. Reply handling
5. Edit support

### Phase 5: E2E Encryption (Week 5)
1. Rust crypto setup
2. Key storage
3. Encrypted room support
4. Fallback handling
5. Testing with encrypted rooms

### Phase 6: Advanced Features (Week 6)
1. File upload/download
2. Room settings management
3. Context persistence
4. Trusted users system
5. Per-room permission overrides

### Phase 7: Polish & Testing (Week 7)
1. Error handling improvements
2. Performance optimization
3. Integration tests
4. Documentation
5. Example configurations

## Configuration

```typescript
interface MatrixConfig {
  // Required
  homeserver: string;
  accessToken: string;
  userId: string;
  anchorUserId: string;          // The primary user with full access
  
  // Optional
  deviceId?: string;
  deviceDisplayName?: string;
  storageDir?: string;
  cryptoStorageDir?: string;
  
  // Permission System
  trustedUsers?: string[];       // Additional trusted users
  publicToolsOnly?: boolean;     // Force public-only mode
  
  // Features
  autoJoinRooms?: boolean;
  enableEncryption?: boolean;
  enableReactions?: boolean;
  enableThreading?: boolean;
  enableTypingNotifications?: boolean;
  
  // Behavior
  commandPrefix?: string;        // Default: "!"
  anchorPrefix?: string;         // Default: "!!" for anchor-only commands
  maxContextMessages?: number;   // Default: 10
  typingTimeout?: number;        // Default: 30000ms
  reactionTimeout?: number;      // Default: 60000ms
  
  // Rate limiting (beyond base interface)
  perRoomRateLimit?: {
    messages: number;
    window: number;
  };
}
```

## Testing Strategy

### Unit Tests
- Client wrapper methods
- Message formatting
- Command parsing
- Context management
- Permission checking
- Tool filtering by user level

### Integration Tests
- Real Matrix server (Synapse in Docker)
- E2E encryption flows
- Multi-room scenarios
- Threading conversations

### Manual Testing Checklist
- [ ] Bot joins room when invited
- [ ] Responds to messages in rooms
- [ ] Responds to DMs
- [ ] Typing indicators appear
- [ ] Reactions work properly
- [ ] Threads maintain context
- [ ] E2E encryption works
- [ ] Files can be uploaded
- [ ] Errors show gracefully
- [ ] Anchor user can access all tools
- [ ] Public users get limited tools only
- [ ] Trusted users get intermediate access
- [ ] Permission errors are user-friendly
- [ ] Anchor prefix (!!) works correctly

## Security Considerations

1. **Token Storage** - Never log access tokens
2. **Crypto Keys** - Secure storage with proper permissions
3. **Rate Limiting** - Prevent abuse and server overload
4. **Input Validation** - Sanitize all user input
5. **Permission Checks** - Respect room power levels
6. **Anchor User Verification** - Prevent spoofing of anchor identity
7. **Tool Access Logging** - Audit trail of who uses which tools
8. **Fail Secure** - Default to most restrictive permissions on error

## Success Metrics

- [ ] 99% message delivery success rate
- [ ] < 500ms response time for typing indicator
- [ ] E2E encryption works in 95%+ of supported rooms
- [ ] Handles 50+ concurrent rooms without performance issues
- [ ] Zero access token leaks in logs
- [ ] Graceful handling of all Matrix events

## Future Enhancements

1. **Voice Messages** - Transcribe and respond to voice
2. **Space Support** - Hierarchical room management  
3. **Bridges** - Support bridged networks
4. **Widgets** - Interactive widgets for complex queries
5. **Presence** - Show online/busy/away status
6. **Read Receipts** - Track what's been read
7. **Push Rules** - Respect user notification preferences

## Dependencies

```json
{
  "dependencies": {
    "matrix-bot-sdk": "^0.6.x",
    "@matrix-org/olm": "^3.2.x",
    "node-html-parser": "^6.1.x",
    "marked": "^4.3.x",
    "sanitize-html": "^2.11.x"
  }
}
```

## Example Usage

```typescript
// Creating the interface
const matrixInterface = new MatrixInterface(context, {
  homeserver: "https://matrix.example.com",
  accessToken: process.env.MATRIX_TOKEN,
  userId: "@bot:example.com",
  anchorUserId: "@youruser:example.com",  // Your personal Matrix ID
  trustedUsers: ["@friend:example.com"],   // Optional trusted users
  enableEncryption: true,
  autoJoinRooms: true,
});

// Starting the bot
await matrixInterface.start();

// The bot will now:
// - Auto-join room invites
// - Respond to messages
// - Show typing indicators
// - Add reaction feedback
// - Handle E2E encrypted rooms
// - Support threading
// - Filter tools based on user permissions
```

### Permission-Aware Tool Registration

```typescript
// In your plugin
export function myPlugin(): Plugin {
  return {
    id: "my-plugin",
    name: "My Plugin",
    version: "1.0.0",
    
    register(context: PluginContext) {
      return {
        tools: [
          // Public tool - anyone can use
          {
            name: "search_notes",
            description: "Search through notes",
            visibility: "public",
            inputSchema: z.object({ query: z.string() }),
            handler: async (args) => { /* ... */ }
          },
          
          // Trusted tool - anchor + trusted users
          {
            name: "create_note",
            description: "Create a new note",
            visibility: "trusted",
            inputSchema: z.object({ 
              title: z.string(),
              content: z.string() 
            }),
            handler: async (args) => { /* ... */ }
          },
          
          // Anchor-only tool
          {
            name: "delete_all",
            description: "Delete all notes",
            visibility: "anchor",
            inputSchema: z.object({ confirm: z.boolean() }),
            handler: async (args) => { /* ... */ }
          }
        ]
      };
    }
  };
}
```

### Example Permission Flows

```typescript
// Public user sends: "search for javascript notes"
// Bot responds with search results

// Public user sends: "create a new note"
// Bot responds: "I don't have permission to create notes. Please ask the administrator."

// Anchor user sends: "!!delete all notes"
// Bot processes the anchor command and executes

// Trusted user sends: "create a note about React"
// Bot creates the note successfully
```

## Documentation Plan

1. **Quick Start Guide** - Get running in 5 minutes
2. **Configuration Reference** - All options explained
3. **Command Reference** - Available commands
4. **Troubleshooting Guide** - Common issues
5. **Security Best Practices** - Token management, etc.
6. **Development Guide** - Extending the interface

This plan provides a comprehensive Matrix interface that matches the polish and functionality users expect from a modern Matrix bot while maintaining the clean architecture established by the Brain system.