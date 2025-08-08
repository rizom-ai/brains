# Conversation Memory Plugin Implementation Plan

## Overview

Create a Service Plugin that provides conversation memory capabilities with smart summarization to entities.

## Key Design Decisions

### Architecture Decisions

- ✅ **Service Plugin** - Not a core Shell service, following plugin-first philosophy
- ✅ **Own SQLite database** - Separate from entities and jobs for data isolation
- ✅ **Opt-in per interface** - Interfaces explicitly choose to use it for privacy
- ✅ **Runtime discovery** - Interfaces check if service exists at runtime
- ✅ **Summaries as entities** - Periodic summaries stored as "conversation-summary" entities
- ✅ **No schema extension** - Uses BaseEntity with metadata
- ✅ **Unlimited retention** - No auto-cleanup for now
- ✅ **Session-scoped** - Each CLI session/Matrix room is separate
- ✅ **MCP tools** - Exposes tools for external access
- ✅ **Smart automatic summarization** - Based on breaks, topics, time, not just message count
- ✅ **Default inclusion** - Part of test-brain app

## Implementation Structure

### 1. Create Package: `plugins/conversation-memory/`

**Files to create:**

- `src/plugin.ts` - Main ConversationMemoryPlugin class (extends ServicePlugin)
- `src/service.ts` - ConversationMemoryService implementation
- `src/db/index.ts` - Database setup with Drizzle
- `src/schema/conversations.ts` - Database schema
- `src/summarizer.ts` - Smart summarization logic
- `src/tools/index.ts` - MCP tool definitions
- `package.json` - Dependencies and build config

### 2. Database Schema

```typescript
// schema/conversations.ts
export const conversations = sqliteTable("conversations", {
  id: text("id").primaryKey(),
  sessionId: text("session_id").notNull(), // CLI session, Matrix room, etc.
  interfaceType: text("interface_type").notNull(),
  started: text("started").notNull(),
  lastActive: text("last_active").notNull(),
  metadata: text("metadata"), // JSON
});

export const messages = sqliteTable("messages", {
  id: text("id").primaryKey(),
  conversationId: text("conversation_id").notNull(),
  role: text("role").notNull(), // 'user' | 'assistant' | 'system'
  content: text("content").notNull(),
  timestamp: text("timestamp").notNull(),
  metadata: text("metadata"), // JSON
});

export const summaryTracking = sqliteTable("summary_tracking", {
  conversationId: text("conversation_id").primaryKey(),
  lastSummarizedAt: text("last_summarized_at"),
  lastMessageId: text("last_message_id"),
  messagesSinceSummary: integer("messages_since_summary").default(0),
});
```

### 3. Service Interface

```typescript
interface ConversationMemoryService {
  // Core operations
  startConversation(sessionId: string, interfaceType: string): Promise<string>;
  addMessage(
    conversationId: string,
    role: string,
    content: string,
  ): Promise<void>;
  getRecentMessages(conversationId: string, limit?: number): Promise<Message[]>;

  // Summarization
  checkSummarizationNeeded(conversationId: string): Promise<boolean>;
  createSummary(conversationId: string): Promise<void>;

  // Search
  searchConversations(
    sessionId: string,
    query: string,
  ): Promise<SearchResult[]>;
}
```

### 4. Smart Summarization Algorithm

The summarization algorithm considers multiple factors:

```typescript
class ConversationSummarizer {
  shouldSummarize(conversation: Conversation): boolean {
    // Check multiple factors:
    // 1. Time since last summary > 1 hour
    // 2. Messages since last summary > 20
    // 3. Detected topic shift (using simple keyword analysis)
    // 4. Session ended (gap > 30 minutes between messages)
    // 5. High complexity (many entities referenced)
    return any of these conditions are met;
  }

  async createSummaryEntity(messages: Message[]): Promise<void> {
    // 1. Generate summary using AI service
    // 2. Create entity with type "conversation-summary"
    // 3. Include metadata: timeRange, messageCount, topics, sessionId
    // 4. Let EntityService handle embedding generation
  }
}
```

### 5. Plugin Implementation

```typescript
export class ConversationMemoryPlugin extends ServicePlugin {
  private service: ConversationMemoryService;
  private db: ConversationDB;

  constructor(config: ConversationMemoryConfig = {}) {
    super("conversation-memory", packageJson, config);
  }

  protected async onRegister(context: ServicePluginContext): Promise<void> {
    // Initialize database
    this.db = createConversationDatabase(this.config.databaseUrl);

    // Create service
    this.service = new ConversationMemoryService(
      this.db,
      context.entityService,
      context.aiService,
      this.logger,
    );

    // Register as a service for other plugins to discover
    context.registerService("conversation-memory", this.service);

    // Register entity type for summaries
    context.entityRegistry.registerType({
      type: "conversation-summary",
      adapter: new BaseEntityAdapter("conversation-summary"),
    });
  }

  protected async getTools(): Promise<PluginTool[]> {
    return createConversationTools(this.service);
  }
}
```

### 6. Interface Integration Pattern

Interfaces can opt-in to use conversation memory through runtime discovery:

```typescript
// In CLI/Matrix/MCP interfaces:
protected async onRegister(context: InterfacePluginContext): Promise<void> {
  // Runtime discovery - check if conversation memory is available
  const memoryService = context.getService('conversation-memory');

  if (memoryService && this.config.enableMemory) {
    // Service exists and interface wants to use it
    this.conversationId = await memoryService.startConversation(
      this.sessionId,
      this.pluginType
    );
  }
}

// When processing messages:
async processQuery(query: string): Promise<string> {
  const memoryService = this.context.getService('conversation-memory');

  if (this.conversationId && memoryService) {
    // Store user message
    await memoryService.addMessage(this.conversationId, 'user', query);

    // Get context from recent messages
    const recentMessages = await memoryService.getRecentMessages(this.conversationId, 10);

    // ... process query with context ...

    // Store assistant response
    await memoryService.addMessage(this.conversationId, 'assistant', response);

    // Check if summarization needed
    if (await memoryService.checkSummarizationNeeded(this.conversationId)) {
      // Trigger async summarization
      memoryService.createSummary(this.conversationId).catch(err =>
        this.logger.error('Failed to create summary', err)
      );
    }
  }

  return response;
}
```

### 7. MCP Tools

```typescript
const tools = [
  {
    name: "get_conversation_history",
    description: "Get recent messages from current conversation",
    inputSchema: z.object({
      limit: z.number().optional().default(20),
      conversationId: z.string().optional(),
    }),
    handler: async (input) => {
      const messages = await service.getRecentMessages(
        input.conversationId || currentConversationId,
        input.limit,
      );
      return { messages };
    },
  },
  {
    name: "search_conversations",
    description: "Search across conversation summaries",
    inputSchema: z.object({
      query: z.string(),
      sessionId: z.string().optional(),
    }),
    handler: async (input) => {
      // This searches the summary entities via EntityService
      const results = await service.searchConversations(
        input.sessionId || currentSessionId,
        input.query,
      );
      return { results };
    },
  },
  {
    name: "get_conversation_context",
    description: "Get context about current conversation",
    inputSchema: z.object({
      conversationId: z.string().optional(),
    }),
    handler: async (input) => {
      const context = await service.getConversationContext(
        input.conversationId || currentConversationId,
      );
      return context;
    },
  },
];
```

### 8. Configuration

```typescript
interface ConversationMemoryConfig {
  databaseUrl?: string; // Default: './data/conversation-memory.db'

  summarization?: {
    minMessages?: number; // Default: 20
    minTimeMinutes?: number; // Default: 60
    idleTimeMinutes?: number; // Default: 30
    enableAutomatic?: boolean; // Default: true
  };

  retention?: {
    enabled?: boolean; // Default: false (unlimited)
    daysToKeep?: number; // Default: 30 (if enabled)
  };
}
```

### 9. Testing Strategy

**Unit Tests:**

- Summarization algorithm logic
- Message storage and retrieval
- Session management
- Database operations

**Integration Tests:**

- Plugin registration and service discovery
- Interface integration with mock CLI
- Summary entity creation
- MCP tool functionality

**Test Scenarios:**

- Multiple concurrent sessions
- Long conversations with summarization
- Service unavailable handling
- Database migration

### 10. Migration Path

For existing deployments:

1. Plugin can be added without breaking changes
2. Interfaces continue to work without it
3. Can be enabled per-interface gradually
4. Historical data can be imported if needed

## Implementation Order

### Phase 1: Core Structure (Week 1)

- [ ] Create package structure
- [ ] Set up database schema and migrations
- [ ] Implement basic plugin class
- [ ] Create service interface

### Phase 2: Basic Operations (Week 1)

- [ ] Implement conversation tracking
- [ ] Add message storage
- [ ] Create retrieval methods
- [ ] Add session management

### Phase 3: Summarization (Week 2)

- [ ] Implement smart summarization algorithm
- [ ] Create summary entity integration
- [ ] Add summary tracking
- [ ] Test with AI service

### Phase 4: Integration (Week 2)

- [ ] Update CLI interface to use service
- [ ] Add runtime discovery pattern
- [ ] Implement MCP tools
- [ ] Add configuration options

### Phase 5: Testing & Documentation (Week 3)

- [ ] Write comprehensive tests
- [ ] Update test-brain app configuration
- [ ] Create usage documentation
- [ ] Add example configurations

## Benefits

1. **Contextual Awareness**: Interfaces can provide context from conversation history
2. **Knowledge Persistence**: Important conversations become searchable knowledge
3. **User Experience**: Natural continuity within sessions
4. **Flexibility**: Optional per-interface with runtime discovery
5. **Scalability**: Separate database allows independent scaling
6. **Privacy**: Session-scoped with opt-in model

## Future Enhancements

- Cross-session linking for same user
- Conversation analytics and insights
- Export/import functionality
- Conversation templates
- Multi-language support
- Real-time collaboration features
