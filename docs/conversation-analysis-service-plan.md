# Conversation Digest Integration Plan

## Architecture Overview

Integrate conversation digest functionality directly into the **ConversationService** to automatically broadcast rich message windows for analysis plugins, eliminating the need for a separate coordination service.

## Background

This plan addresses the need for auto-extraction functionality in the Topics plugin and future analysis plugins (chronological summarization, sentiment analysis, action items extraction, knowledge graph building, etc.). Instead of creating a separate coordination service, we integrate digest broadcasting directly into the ConversationService for simplicity and efficiency.

## Implementation Approach

### 1. ConversationService Enhancement

```typescript
// Enhanced ConversationService with digest broadcasting
class ConversationService {
  // Existing methods...
  async addMessage(conversationId, role, content, metadata) {
    // Add message to database
    // Update conversation tracking

    // Broadcast individual message event (existing)
    await this.messageBus.send("conversation:messageAdded", {...})

    // Check for digest trigger
    if (messageCount % DIGEST_TRIGGER_INTERVAL === 0) {
      await this.broadcastDigest(conversationId, messageCount);
    }
  }

  private async broadcastDigest(conversationId: string, messageCount: number) {
    // Fetch overlapping window of messages
    // Broadcast conversation:digest event with rich payload
  }
}
```

**Configuration:**

- `DIGEST_TRIGGER_INTERVAL = 10` messages
- `DIGEST_WINDOW_SIZE = 20` messages
- Overlap = 10 messages (50% overlap for continuity)

### 2. Plugin Subscription Pattern

```typescript
// In topics plugin (or any analysis plugin)
export class TopicsPlugin extends ServicePlugin<TopicsPluginConfig> {
  override async onRegister(context: ServicePluginContext): Promise<void> {
    // Existing registration code...

    // Subscribe to conversation digest events
    context
      .getMessageBus()
      .subscribe(
        "conversation:digest",
        this.handleConversationDigest.bind(this),
      );
  }

  private async handleConversationDigest(payload: ConversationDigestPayload) {
    const { conversationId, messages, windowStart, windowEnd } = payload;

    // Extract topics from the message window
    await this.extractTopicsFromWindow(conversationId, messages);
  }
}
```

## Implementation Plan

### Phase 1: ConversationService Enhancement

**Files to Modify:**

- `shell/conversation-service/src/conversation-service.ts` - Add digest broadcasting
- `shell/conversation-service/src/types.ts` - Add digest payload interface
- `shell/conversation-service/test/conversation-service.test.ts` - Add digest tests

**Key Features:**

- Add digest broadcasting logic to `addMessage()` method
- Track message counts for digest triggers
- Fetch overlapping message windows efficiently
- Broadcast `conversation:digest` events with rich payloads

**Digest Payload Interface:**

```typescript
interface ConversationDigestPayload {
  conversationId: string;
  messageCount: number;
  messages: Message[];
  windowStart: number;
  windowEnd: number;
  windowSize: number;
  timestamp: string;
}
```

### Phase 2: Topics Plugin Integration

**Files to Modify:**

- `plugins/topics/src/index.ts` - Add digest subscription
- `plugins/topics/src/handlers/topic-extraction-handler.ts` - Add digest handler
- `plugins/topics/test/plugin.test.ts` - Add digest tests

### Phase 3: Intelligent Coordination (Future)

**Advanced Features (deferred for initial implementation):**

- **Cooldown management**: Prevent too-frequent analysis runs
- **Dependency management**: Summary waits for topics, etc.
- **Resource coordination**: Prevent multiple heavy analyses simultaneously
- **Batching**: Trigger multiple analyses together when efficient
- **Backoff strategies**: Handle analysis failures gracefully

### Phase 4: Configuration Management

**Global Analysis Config in Shell:**

```typescript
interface AnalysisConfig {
  enableAutoAnalysis: boolean;
  maxConcurrentAnalyses: number; // Future feature
  analysisPlugins: {
    [pluginId: string]: {
      enabled: boolean;
      messageThreshold: number;
      customConfig: any;
    };
  };
  // Note: global cooldown removed for initial implementation
}
```

### Phase 5: Topics Plugin Integration

**Modify Topics Plugin:**

- Add auto-extraction configuration options
- Register with analysis service:

```typescript
// In TopicsPlugin.onRegister()
const analysisService = context.getConversationAnalysisService();
analysisService.registerAnalysisPlugin({
  pluginId: "topics",
  analysisType: "topic-extraction",
  triggerConfig: {
    messageThreshold: this.config.autoExtractionThreshold || 50,
    priority: 1,
  },
  executeAnalysis: this.executeTopicExtraction.bind(this),
});

// Plugin also subscribes to milestone events:
context.getMessageBus().subscribe("conversation:milestone", async (payload) => {
  const { conversationId, messages } = payload;
  await this.executeTopicExtraction(conversationId, messages, {});
});
```

## Architecture Benefits

### Core Service Advantages:

- ✅ **Always Available**: Guaranteed presence for all plugins
- ✅ **Lifecycle Management**: Starts with shell, no load order issues
- ✅ **Performance**: Direct service access, no plugin overhead
- ✅ **Consistency**: Follows existing pattern (ConversationService, EntityService, JobQueueService)
- ✅ **Cross-Plugin Coordination**: Can orchestrate between multiple analysis plugins

### For Current Implementation:

- ✅ Solves topic auto-extraction needs
- ✅ Centralized message tracking
- ✅ Unified configuration

### For Future Plugins:

- ✅ **Chronological Summarization Plugin**: Registers for every 100 messages, depends on topics
- ✅ **Sentiment Analysis Plugin**: Registers for every 20 messages, high priority
- ✅ **Action Items Plugin**: Registers for every 30 messages, depends on topics and summary
- ✅ **Knowledge Graph Plugin**: Registers for every 200 messages, depends on all others

## Technical Implementation Details

### File Structure

```
shell/conversation-analysis-service/
├── src/
│   ├── conversation-analysis-service.ts    # Main service class
│   ├── activity-tracker.ts                 # Message counting/tracking
│   ├── analysis-scheduler.ts               # Coordination logic
│   ├── types.ts                           # TypeScript interfaces
│   ├── schemas.ts                         # Zod validation
│   └── index.ts                           # Exports
├── test/
│   ├── conversation-analysis-service.test.ts
│   └── activity-tracker.test.ts
├── package.json
└── README.md
```

### Integration Points

1. **Shell Core**: Add service to shell initialization and ServiceRegistry
2. **Plugin Context**: Extend plugin contexts to include analysis service access
3. **Topics Plugin**: Modify to register for auto-extraction instead of manual triggers
4. **Configuration**: Add global analysis settings to shell configuration

### Message Flow

1. User/system adds message via `ConversationService.addMessage()`
2. ConversationService stores message and broadcasts `conversation:messageAdded` (existing)
3. ConversationService checks if message count is divisible by `DIGEST_TRIGGER_INTERVAL` (10)
4. If digest trigger is met:
   - Calculate overlapping window: `windowSize` (20) messages ending at current count
   - Fetch message window from database
   - Broadcast `conversation:digest` event with rich payload:
     ```typescript
     {
       conversationId: string,
       messageCount: number,
       messages: Message[], // 20-message window for analysis
       windowStart: number, // 1-based start position
       windowEnd: number,   // 1-based end position (current messageCount)
       windowSize: number,  // 20
       timestamp: string
     }
     ```
5. Analysis plugins (topics, etc.) receive digest events and process message windows
6. Analysis results are stored as entities by individual plugins

**Example digest sequence:**

- Message 10: Digest with messages 1-20 (if available, else 1-10)
- Message 20: Digest with messages 1-20
- Message 30: Digest with messages 11-30 (10 message overlap)
- Message 40: Digest with messages 21-40 (10 message overlap)

## Migration Strategy

1. **Phase 1**: Add digest broadcasting to ConversationService
2. **Phase 2**: Update topics plugin to subscribe to digest events
3. **Phase 3**: Test and validate digest-based auto-extraction
4. **Future**: Additional analysis plugins can easily subscribe to digest events

This approach provides immediate value for topics auto-extraction with minimal architectural changes, while enabling future analysis plugins to easily tap into the digest stream.

## Benefits

### Simplified Architecture:

- ✅ **No separate service**: Digest logic integrated into existing ConversationService
- ✅ **Event-driven**: Plugins simply subscribe to digest events
- ✅ **Rich payloads**: Eliminates duplicate database fetches
- ✅ **Overlapping windows**: Ensures topic continuity across boundaries

### For Current Implementation:

- ✅ Solves topic auto-extraction needs with minimal changes
- ✅ Maintains existing `conversation:messageAdded` events
- ✅ Configurable trigger and window sizes

### For Future Plugins:

- ✅ **Easy integration**: Just subscribe to `conversation:digest` events
- ✅ **Rich context**: 20-message windows with conversation flow
- ✅ **Efficient processing**: No need to manage own message tracking
- ✅ **Scalable**: Multiple plugins can process same digest efficiently

## Status

- **Current State**: Plan updated to reflect ConversationService integration approach
- **Prerequisites**: Current topic extraction improvements completed
- **Next Steps**: Implement digest broadcasting in ConversationService
