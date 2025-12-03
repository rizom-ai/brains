# Interface Plugins v2: Agent-based Architecture

**Date**: 2025-12-02
**Status**: Planning
**Goal**: Simplify MessageInterfacePlugins by replacing command-based interaction with AI agent-based interaction

## Executive Summary

Current MessageInterfaces (CLI, Matrix) implement complex command parsing, argument validation, and help generation. This creates maintenance burden and duplicates functionality that AI agents handle naturally.

**Proposed change**: MessageInterfaces become thin chat layers where users interact with an AI agent that has MCP tools at its disposal. Commands disappear entirely.

## Decisions Made

Based on planning discussion:

1. ✅ Interfaces become thin chat layers relaying messages to/from AI agent
2. ✅ Commands removed entirely - all input goes through agent
3. ✅ Agent lives in shared `shell/agent-service` (not duplicated per interface)
4. ✅ Use Vercel AI SDK (via existing AIService) - not Anthropic SDK directly
5. ✅ No streaming - wait for complete response
6. ✅ Maintain conversation history across messages
7. ✅ Destructive tools require confirmation before executing
8. ✅ Keep commands as deprecated fallback during migration, remove after
9. ✅ Agent gets personality from IdentityService + agent-specific instructions
10. ✅ Only MessageInterfacePlugins migrate (CLI, Matrix) - not InterfacePlugins (webserver)
11. ✅ Start with Matrix (new implementation from scratch), then CLI
12. ✅ Keep old implementations alongside new ones during transition
13. ✅ Collapse `MessageInterfacePlugin` into `InterfacePlugin` after migration
14. ✅ Remove `CommandRegistry` package after migration complete
15. ✅ AgentService reuses AIService internally (not duplicate SDK setup)
16. ✅ Agent gets tools from MCPService

## Current Architecture

### What We Have Now

```
User Input ("/search foo")
    ↓
Command Parser (regex, argument extraction)
    ↓
CommandRegistry.execute()
    ↓
Command Handler (validation, formatting)
    ↓
Tool Execution
    ↓
Response Formatting
    ↓
User Output
```

### Current Interface Responsibilities

Each MessageInterface currently handles:

1. **Command parsing** - Extract command name and arguments from input
2. **Argument validation** - Check required args, types, defaults
3. **Help generation** - Build help text for each command
4. **Error formatting** - User-friendly error messages
5. **Response formatting** - Convert tool results to display format
6. **Conversation tracking** - Maintain conversation state
7. **Message relay** - Send/receive through transport (terminal, Matrix, etc.)

### Pain Points

- **Duplication**: CLI and Matrix both implement command parsing
- **Maintenance**: Adding a tool requires updating command registry
- **Limited**: Commands are rigid; users must know exact syntax
- **Complexity**: ~500+ lines of command handling code per interface

## Proposed Architecture

### New Flow

```
User Input ("find stuff about typescript")
    ↓
Interface (thin layer)
    ↓
AgentService (uses AIService + MCPService)
    ↓
Agent decides: call search tool, format results
    ↓
Response
    ↓
User Output
```

### Interface Responsibilities (v2)

Each interface only handles:

1. **Message relay** - Send user input to agent, display agent response
2. **Transport** - Terminal I/O, Matrix protocol, etc.
3. **Session management** - Track conversation context for agent

That's it. No command parsing, no argument validation, no help generation.

### What the AI Agent Handles

- Understanding user intent (natural language)
- Deciding which tools to call
- Calling tools with correct parameters
- Formatting responses appropriately
- Handling errors gracefully
- Providing help when asked
- Asking confirmation for destructive operations

## Implementation Plan

### Phase 1: AgentService

**Goal**: Create `shell/agent-service` package

**Dependencies**:

- AIService (for LLM calls via Vercel AI SDK)
- MCPService (for available tools)
- ConversationService (for conversation history)
- IdentityService (for brain personality)

```typescript
// shell/agent-service/src/agent-service.ts

export class AgentService {
  constructor(
    private aiService: AIService,
    private mcpService: MCPService,
    private conversationService: ConversationService,
    private identityService: IdentityService,
  ) {}

  async chat(message: string, conversationId: string): Promise<string> {
    // Get conversation history
    const history = await this.conversationService.getMessages(conversationId);

    // Get available tools from MCP
    const tools = this.mcpService.getToolsForAI();

    // Get system prompt from identity + agent instructions
    const systemPrompt = this.buildSystemPrompt();

    // Call AI with tools via AIService
    const response = await this.aiService.generateWithTools({
      system: systemPrompt,
      messages: [...history, { role: "user", content: message }],
      tools,
    });

    // Handle tool execution loop
    return this.processResponse(response, conversationId);
  }

  private buildSystemPrompt(): string {
    const identity = this.identityService.getIdentity();
    return `${identity.systemPrompt}

You have access to tools for managing a personal knowledge system.
Use tools when they would help answer the user's question.
Be concise and helpful.
For destructive operations (delete, publish), ask for confirmation first.`;
  }
}
```

### Phase 2: New Matrix Interface

**Goal**: Create new simplified Matrix implementation from scratch

**New structure**:

```
interfaces/matrix/
├── src/
│   ├── matrix-interface.ts    # Simplified - just transport + agent relay
│   ├── matrix-client.ts       # Matrix SDK wrapper (E2E, rooms, etc.)
│   └── index.ts
```

**Key simplification**:

- Remove all command parsing
- Remove CommandRegistry usage
- Just: receive message → send to AgentService → send response

### Phase 3: New CLI Interface

**Goal**: Apply same pattern to CLI

**New structure**:

```
interfaces/cli/
├── src/
│   ├── cli-interface.ts       # Simplified interface
│   ├── components/
│   │   ├── Chat.tsx           # Main chat component
│   │   ├── Message.tsx        # Message display
│   │   └── Input.tsx          # User input
│   └── index.ts
```

### Phase 4: Cleanup

**Goal**: Remove deprecated code

1. Remove old Matrix and CLI implementations
2. Collapse `MessageInterfacePlugin` into `InterfacePlugin`
3. Delete `shell/command-registry` package
4. Remove `getCommands()` from plugin interface
5. Remove command-related code from plugins

## Technical Details

### System Prompt Structure

```typescript
const systemPrompt = `
${identityService.getIdentity().systemPrompt}

## Agent Instructions

You are an AI assistant with access to a personal knowledge management system.

### Tool Usage
- Use tools when they help answer the user's question
- You can call multiple tools in sequence if needed
- Format tool results in a user-friendly way

### Destructive Operations
For these operations, ask for confirmation before executing:
- Deleting entities
- Publishing content
- Modifying system settings

### Response Style
- Be concise and helpful
- Use markdown formatting when appropriate
- If a tool fails, explain the error clearly
`;
```

### Tool Confirmation Flow

```typescript
// When agent decides to use a destructive tool:
// 1. Agent responds: "I'll delete the note 'Meeting Notes'. Confirm? (yes/no)"
// 2. User responds: "yes"
// 3. Agent executes tool and reports result
```

## Migration Strategy

### During Transition

1. Old interfaces remain available (deprecated)
2. New interfaces are opt-in initially
3. Commands show deprecation warning: "Commands are deprecated. Try asking naturally."
4. Both old and new work side-by-side

### After Transition

1. Remove old interface implementations
2. Remove CommandRegistry
3. Remove command-related plugin methods
4. Collapse MessageInterfacePlugin into InterfacePlugin

## Success Criteria

- [ ] AgentService created and working
- [ ] New Matrix interface using AgentService
- [ ] New CLI interface using AgentService
- [ ] Old implementations deprecated with warnings
- [ ] User can accomplish all tasks via natural language
- [ ] Destructive operations require confirmation
- [ ] Tests pass
- [ ] Old code removed
- [ ] CommandRegistry deleted
- [ ] MessageInterfacePlugin collapsed into InterfacePlugin

## Risks & Mitigations

| Risk                           | Mitigation                                     |
| ------------------------------ | ---------------------------------------------- |
| AI hallucinations              | Clear system prompts, tool-based grounding     |
| Cost increase (more API calls) | Efficient prompting, caching where appropriate |
| Slower than commands           | Accept trade-off for better UX                 |
| Users miss commands            | Deprecated fallback during transition          |
| Tool errors confuse agent      | Good error messages, retry logic               |

## References

- Current CLI implementation: `interfaces/cli/`
- Current Matrix implementation: `interfaces/matrix/`
- MCP Service: `shell/mcp-service/`
- AI Service: `shell/ai-service/`
- Identity Service: `shell/identity-service/`
- Conversation Service: `shell/conversation-service/`
- Vercel AI SDK: https://sdk.vercel.ai/docs
