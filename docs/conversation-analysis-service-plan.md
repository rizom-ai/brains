# Conversation Analysis Core Service Plan

## Architecture Overview

Create a **Conversation Analysis Service** as a core shell service that coordinates auto-analysis across multiple plugins, providing centralized message tracking, intelligent scheduling, and unified configuration.

## Background

This plan addresses the need for auto-extraction functionality in the Topics plugin and future analysis plugins (chronological summarization, sentiment analysis, action items extraction, knowledge graph building, etc.). Rather than having each plugin individually subscribe to conversation events, a centralized service coordinates all conversation analysis activities.

## Core Service Structure

### 1. Conversation Analysis Service (Core Service)

```typescript
// New core service: shell/conversation-analysis-service/
class ConversationAnalysisService {
  - trackConversationActivity()
  - registerAnalysisPlugin()
  - scheduleAnalysis()
  - coordinateExecution()
}
```

**Location**: `shell/conversation-analysis-service/` (follows existing core service pattern)

### 2. Analysis Plugin Registration Interface

```typescript
interface AnalysisPluginRegistration {
  pluginId: string;
  analysisType: string; // "topics", "summary", "sentiment", etc.
  triggerConfig: {
    messageThreshold: number;
    priority: number;
    // Note: cooldowns and dependencies removed for initial implementation
  };
  executeAnalysis: (conversationId: string, messages: Message[], config: any) => Promise<void>;
}
```

### 3. Service Integration with Shell Core

- Register in ServiceRegistry during shell initialization
- Start before plugins load (like ConversationService, EntityService)
- Available to all plugins via context.getService()

## Implementation Plan

### Phase 1: Core Service Foundation

**Files to Create:**

- `shell/conversation-analysis-service/src/conversation-analysis-service.ts`
- `shell/conversation-analysis-service/src/types.ts`
- `shell/conversation-analysis-service/src/schemas.ts`
- `shell/conversation-analysis-service/src/activity-tracker.ts`
- `shell/conversation-analysis-service/src/index.ts`
- `shell/conversation-analysis-service/test/conversation-analysis-service.test.ts`

**Shell Integration:**

- Add to `shell/core/src/shell.ts` initialization
- Register in ServiceRegistry
- Add to dependency injection context

**Key Features:**

- Subscribe to `conversation:messageAdded` events from ConversationService
- Track message counts and analysis history per conversation
- Provide plugin registration API
- Basic scheduling logic

### Phase 2: Plugin Registration System

**Core Service API:**

```typescript
interface IConversationAnalysisService {
  registerAnalysisPlugin(registration: AnalysisPluginRegistration): void;
  unregisterAnalysisPlugin(pluginId: string, analysisType: string): void;
  getAnalysisHistory(conversationId: string): AnalysisHistory[];
  triggerAnalysis(conversationId: string, analysisType: string): Promise<void>;
}
```

**Plugin Context Integration:**

- Add to ServicePluginContext and CorePluginContext
- Plugins access via `context.getConversationAnalysisService()`

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
context.getMessageBus().subscribe(
  "conversation:milestone",
  async (payload) => {
    const { conversationId, messages } = payload;
    await this.executeTopicExtraction(conversationId, messages, {});
  }
);
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

1. ConversationService broadcasts `conversation:messageAdded`
2. ConversationAnalysisService receives and tracks message counts per conversation
3. When message thresholds are met:
   - Service fetches the relevant message window from ConversationService
   - Service broadcasts `conversation:milestone` event with rich payload:
     ```typescript
     {
       conversationId: string,
       messageCount: number,
       messages: Message[], // The message window for analysis
       windowStart: number, // 1-based start position
       windowEnd: number    // 1-based end position
     }
     ```
4. Registered plugins receive the event and execute analysis with provided messages
5. Analysis results are processed by individual plugins (stored as entities, etc.)

## Migration Strategy

1. **Phase 1**: Implement core service with basic message tracking
2. **Phase 2**: Add topics plugin integration for auto-extraction
3. **Phase 3**: Add coordination features as needed
4. **Future**: New analysis plugins register with service

This approach provides immediate value for topics auto-extraction while building foundation for a robust multi-plugin analysis ecosystem.

## Status

- **Current State**: Plan documented, ready for implementation
- **Prerequisites**: Current topic extraction improvements completed
- **Next Steps**: Implement Phase 1 when auto-extraction feature is needed
