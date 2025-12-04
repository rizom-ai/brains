# Interface Plugins v2: Agent-based Architecture

**Date**: 2025-12-02
**Status**: In Progress (Phase 2 Complete)
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

**Goal**: Remove all command-related code

#### 4.1 Remove Old Interface Implementations

- Remove `MatrixInterface` (v1) from `interfaces/matrix/`
- Remove old CLI command-based implementation from `interfaces/cli/`
- Rename `MatrixInterfaceV2` → `MatrixInterface`

#### 4.2 Remove Command Infrastructure

- Delete `shell/command-registry/` package entirely
- Remove `MessageInterfacePlugin` base class
- Collapse into `InterfacePlugin`
- Remove `registerPluginCommands()` from Shell and PluginManager
- Remove command-related types from `shell/plugins/src/interfaces.ts`

#### 4.3 Remove Command Definitions from All Plugins

**Plugins with commands to remove:**

| Plugin         | Commands File           | Commands                                                                                          |
| -------------- | ----------------------- | ------------------------------------------------------------------------------------------------- |
| link           | `src/commands/index.ts` | link-capture, link-list, link-search, link-get                                                    |
| summary        | `src/commands/index.ts` | summary-list, summary-get, summary-export, summary-delete, summary-stats                          |
| topics         | `src/commands/index.ts` | topics-list, topics-extract, topics-get, topics-search                                            |
| directory-sync | `src/commands/index.ts` | directory-sync                                                                                    |
| git-sync       | `src/commands/index.ts` | git-sync                                                                                          |
| site-builder   | `src/commands/index.ts` | site-generate, site-build                                                                         |
| system         | `src/commands/index.ts` | search, get, get-job-status, get-conversation, list-conversations, get-messages, identity, status |
| decks          | `src/commands/index.ts` | decks-list                                                                                        |
| cli            | `src/commands/index.ts` | progress, clear                                                                                   |

**For each plugin:**

1. Delete `src/commands/` directory
2. Remove `getCommands()` method from plugin class
3. Remove command-related imports
4. Update plugin exports (remove command exports)

#### 4.4 Update Shell Core

- Remove `commandRegistry` property from Shell class
- Remove `getCommandRegistry()` method
- Update `ShellInitializer` to skip CommandRegistry initialization

#### 4.5 Update Tests

- Delete `shell/command-registry/test/` directory
- Delete plugin command tests (`plugins/*/test/commands/`)
- Update `MockShell` to remove `registerPluginCommands()`

#### 4.6 Update Plugin Base Classes

- Remove `commands` from `PluginCapabilities` interface
- Remove command-related context methods from plugin contexts

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

### Phase 1: AgentService ✅

- [x] AgentService created with AIService, MCPService, ConversationService, IdentityService integration
- [x] AIService extended with `generateWithTools()` method
- [x] Tool filtering by permission level (`listToolsForPermissionLevel`)
- [x] ChatContext for per-message permission passing

### Phase 2: Matrix Interface ✅

- [x] MatrixInterfaceV2 created using AgentService
- [x] Routes all messages to agent (no command parsing)
- [x] Permission-based tool filtering per message
- [x] Both v1 and v2 exported during transition

### Phase 3: CLI Interface

- [ ] New CLI interface using AgentService
- [ ] Simple REPL with agent relay
- [ ] Handles confirmation prompts

### Phase 4: Cleanup

- [ ] Old MatrixInterface (v1) removed
- [ ] Old CLI implementation removed
- [ ] CommandRegistry package deleted
- [ ] Command definitions removed from all 8 plugins
- [ ] MessageInterfacePlugin collapsed into InterfacePlugin
- [ ] All command-related tests removed/updated

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
