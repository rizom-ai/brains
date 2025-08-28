# Conversation Context Refactoring

## Overview

This document outlines the refactoring of conversation history handling in the content generation pipeline to achieve better separation of concerns and more explicit control over when conversation context is included.

## Problem Statement

Currently, the `AIContentDataSource` automatically injects conversation history into ALL AI content generation when a `conversationId` is provided. This creates several issues:

1. **Tight Coupling**: The content generation DataSource is coupled with `ConversationService`
2. **Unintended Context**: Site content generation (hero sections, features, etc.) unintentionally includes chat history
3. **Hidden Behavior**: Conversation context is injected "magically" without caller awareness
4. **Inflexibility**: No way to control how much history or what type of context is included

### Current Flow

```
Interface → shell.query(prompt, {conversationId}) → ContentService
    → AIContentDataSource → [automatically fetches conversation] → AI generation
```

## Proposed Solution

Move conversation history handling completely OUT of the content generation pipeline. The interface layer (caller) should:

1. Explicitly fetch conversation history when needed
2. Pass it as part of the context data
3. Let the DataSource remain a pure content generator

### New Flow

```
Interface → [fetch conversation if needed] → shell.query(prompt, {conversationHistory})
    → ContentService → AIContentDataSource → [uses provided context] → AI generation
```

## Benefits

- **Clean Separation of Concerns**: Content generation focuses solely on generating content
- **Explicit Control**: Callers decide if/when/how much history to include
- **Flexibility**: Different interfaces can handle conversation context differently
- **Better Testing**: Simpler components without hidden dependencies
- **No Side Effects**: No unexpected conversation context in generated content

## Implementation Details

### 1. AIContentDataSource Changes

**Remove:**

- `conversationService` from constructor
- Conversation fetching logic in `buildPrompt()` method
- The special handling of `conversationId` parameter

**Keep:**

- Using context data if provided
- Entity search and context building
- Template-based prompt construction

**Before:**

```typescript
constructor(
  private readonly aiService: IAIService,
  private readonly conversationService: IConversationService, // REMOVE
  private readonly entityService: EntityService,
  private readonly templateRegistry: TemplateRegistry,
  private readonly logger: Logger,
) {}

private async buildPrompt(...) {
  // Add conversation context if not a system conversation
  if (context.conversationId && context.conversationId !== "system" && ...) {
    const messages = await this.conversationService.getMessages(...); // REMOVE
    // ... format and add to prompt
  }
}
```

**After:**

```typescript
constructor(
  private readonly aiService: IAIService,
  private readonly entityService: EntityService,
  private readonly templateRegistry: TemplateRegistry,
  private readonly logger: Logger,
) {}

private async buildPrompt(...) {
  // Use conversation history if explicitly provided in context data
  if (context.data?.conversationHistory) {
    prompt += `\n\nRecent conversation context:\n${context.data.conversationHistory}`;
  }
}
```

### 2. MessageInterfacePlugin Changes

**Add conversation fetching before queries:**

```typescript
public async processQuery(
  query: string,
  context: MessageContext,
): Promise<string> {
  const pluginContext = this.getContext();
  const conversationId = `${context.interfaceType}-${context.channelId}`;

  // Fetch conversation history explicitly
  let conversationHistory: string | undefined;
  try {
    if (conversationId !== 'system' && conversationId !== 'default') {
      const messages = await pluginContext.getMessages(conversationId, { limit: 20 });
      conversationHistory = this.formatMessagesAsContext(messages);
    }
  } catch (error) {
    this.logger.debug("Could not fetch conversation history", { error });
  }

  // Pass conversation history explicitly in the context
  const result = await this.queue.add(async () => {
    const queryResponse = await pluginContext.query(query, {
      userId: context.userId,
      conversationId,
      messageId: context.messageId,
      threadId: context.threadId,
      timestamp: context.timestamp.toISOString(),
      conversationHistory, // Explicitly passed
    });
    return queryResponse.message;
  });

  return result;
}
```

**Add helper method for formatting:**

```typescript
private formatMessagesAsContext(messages: Message[]): string {
  if (messages.length === 0) return "";

  return messages
    .map((m) => {
      const role = m.role.charAt(0).toUpperCase() + m.role.slice(1);
      return `${role}: ${m.content}`;
    })
    .join("\n\n");
}
```

### 3. Shell Core Updates

Update the `Shell` class constructor to not pass `conversationService` to `AIContentDataSource`:

```typescript
// In registerCoreDataSources()
const aiContentDataSource = new AIContentDataSource(
  this.aiService,
  // Remove: this.conversationService,
  this.entityService,
  this.templateRegistry,
  this.logger,
);
```

### 4. Type Updates

The query context already uses `Record<string, unknown>` so no type changes are needed. The `conversationHistory` will be passed as part of the context data.

## Testing Strategy

### Unit Tests

1. **AIContentDataSource**: Test that it uses provided conversation history from context
2. **MessageInterfacePlugin**: Test that it fetches and passes conversation history
3. **Shell**: Ensure query still works with new DataSource signature

### Integration Tests

1. Verify conversation context is included in chat queries
2. Verify NO conversation context in site content generation
3. Test error handling when conversation service is unavailable

### Manual Testing

1. Start a conversation in CLI interface
2. Ask follow-up questions - verify context is maintained
3. Generate site content - verify no conversation leakage
4. Test with multiple concurrent conversations

## Migration Notes

This is a **breaking change** for the internal architecture but not for external APIs:

- No changes to plugin APIs
- No changes to command interfaces
- No database migrations needed

## Rollback Plan

If issues are discovered:

1. Revert the commit
2. The old behavior will be restored immediately
3. No data migration or cleanup needed

## Timeline

1. **Phase 1** (Current): Document the plan
2. **Phase 2**: Remove conversation dependencies from AIContentDataSource
3. **Phase 3**: Update MessageInterfacePlugin to handle conversation
4. **Phase 4**: Update Shell and tests
5. **Phase 5**: Testing and verification

## Decision Log

- **2025-01-28**: Decided to move conversation handling to interface layer for better separation of concerns
- Rejected alternative: Adding `includeConversationContext` flag to templates (too complex, wrong abstraction level)
- Rejected alternative: Creating separate DataSources for conversational vs static content (code duplication)
