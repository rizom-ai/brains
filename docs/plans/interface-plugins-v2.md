# Interface Plugins v2: Agent-based Architecture

**Date**: 2025-12-02
**Status**: Planning
**Goal**: Simplify interface plugins by replacing command-based interaction with AI agent-based interaction

## Executive Summary

Current interfaces (CLI, Matrix) implement complex command parsing, argument validation, and help generation. This creates maintenance burden and duplicates functionality that AI agents handle naturally.

**Proposed change**: Interfaces become thin chat layers where users interact with an AI agent that has MCP tools at its disposal. Commands disappear entirely.

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

Each interface currently handles:

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
AI Agent (Claude with MCP tools)
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

## Implementation Plan

### Phase 1: Core Agent Infrastructure

**Goal**: Create a reusable AI agent that has MCP tools available

**New package**: `shell/agent-service` or extend `shell/ai-service`

```typescript
interface AgentService {
  // Process user message, return agent response
  chat(message: string, conversationId: string): Promise<string>;

  // Agent has access to all registered MCP tools
  // Tools are automatically discovered from MCPService
}
```

**Implementation approach**:

Option A: Use Anthropic Claude API directly with tool_use

```typescript
const response = await anthropic.messages.create({
  model: "claude-sonnet-4-20250514",
  messages: conversationHistory,
  tools: mcpService.getToolsAsClaudeFormat(),
});
```

Option B: Use Claude Agent SDK (if available/appropriate)

Option C: Use MCP client SDK to connect to our own MCP server

**Decision needed**: Which approach? Option A seems simplest.

### Phase 2: Simplify CLI Interface

**Goal**: Remove command handling, use agent for all interactions

**Current CLI structure**:

```
interfaces/cli/
├── src/
│   ├── cli-interface.ts      # Main interface
│   ├── components/           # Ink React components
│   ├── commands/             # Command handlers (DELETE)
│   └── lib/                  # Utilities
```

**New CLI structure**:

```
interfaces/cli/
├── src/
│   ├── cli-interface.ts      # Simplified interface
│   ├── components/
│   │   ├── Chat.tsx          # Main chat component
│   │   ├── Message.tsx       # Message display
│   │   └── Input.tsx         # User input
│   └── lib/
│       └── formatting.ts     # Output formatting
```

**Key changes**:

- Remove `CommandRegistry` usage
- Remove command parsing logic
- Remove `/help`, `/search`, etc. handling
- Add: Send all input to AgentService
- Add: Stream agent responses to terminal

**Before** (current):

```typescript
async processInput(input: string): Promise<void> {
  if (input.startsWith('/')) {
    const [command, ...args] = input.slice(1).split(' ');
    const result = await this.commandRegistry.execute(command, args);
    this.display(result);
  } else {
    const response = await this.shell.processQuery(input, this.conversationId);
    this.display(response);
  }
}
```

**After** (v2):

```typescript
async processInput(input: string): Promise<void> {
  const response = await this.agentService.chat(input, this.conversationId);
  this.display(response);
}
```

### Phase 3: Simplify Matrix Interface

**Same pattern as CLI**:

- Remove command handling
- Forward all messages to AgentService
- Display agent responses

**Matrix-specific considerations**:

- Room context (different conversations per room)
- Mentions (respond when mentioned)
- Threading (optional)

### Phase 4: Remove Command Infrastructure

Once all interfaces use agents:

**Delete or deprecate**:

- `shell/command-registry` package
- Command-related code in plugins
- `getCommands()` from plugin interface

**Keep**:

- MCP tools (this is what agents use)
- Tool registration in plugins

### Phase 5: Enhance Agent Capabilities

**After basic agent works**:

1. **System prompts** - Customize agent personality per brain
2. **Tool filtering** - Limit which tools agent can use based on context
3. **Streaming** - Stream responses for better UX
4. **Multi-turn tool use** - Agent can call multiple tools in sequence
5. **Confirmation prompts** - Agent asks before destructive operations

## Migration Strategy

### Backward Compatibility

During transition:

1. Keep commands working (deprecated)
2. Add agent mode as default
3. Commands trigger deprecation warning
4. Remove commands in v3

### User Communication

- Announce: "You can now talk naturally instead of using commands"
- Document: Common tasks in natural language
- Fallback: Commands still work but show "try asking naturally"

## Technical Decisions

### 1. Where does the agent live?

**Option A**: In each interface (duplicated)

- Pros: Interface-specific customization
- Cons: Duplication, inconsistency

**Option B**: Shared AgentService in shell ✅ Recommended

- Pros: Single implementation, consistent behavior
- Cons: Less interface-specific control

### 2. How do we handle streaming?

**Option A**: Wait for complete response

- Pros: Simple
- Cons: Poor UX for long responses

**Option B**: Stream tokens ✅ Recommended

- Pros: Good UX, feels responsive
- Cons: More complex interface code

### 3. What about tool confirmation?

Some tools are destructive (delete, publish). Should agent:

**Option A**: Always execute immediately

- Pros: Fast, simple
- Cons: Dangerous

**Option B**: Ask confirmation for destructive tools ✅ Recommended

- Pros: Safe
- Cons: Extra turn

**Option C**: Permission levels on tools

- Pros: Flexible
- Cons: Complex

### 4. Conversation context

**Option A**: Fresh context each message

- Pros: Simple, predictable
- Cons: No memory, repetitive

**Option B**: Maintain conversation history ✅ Recommended

- Pros: Natural conversation flow
- Cons: Token usage, context limits

## Code Examples

### AgentService Implementation

```typescript
// shell/agent-service/src/agent-service.ts

import Anthropic from "@anthropic-ai/sdk";
import type { MCPService } from "@brains/mcp-service";
import type { ConversationService } from "@brains/conversation-service";

export class AgentService {
  private client: Anthropic;
  private mcpService: MCPService;
  private conversationService: ConversationService;

  async chat(message: string, conversationId: string): Promise<string> {
    // Get conversation history
    const history = await this.conversationService.getMessages(conversationId);

    // Get available tools
    const tools = this.mcpService.getToolsForClaude();

    // Call Claude with tools
    const response = await this.client.messages.create({
      model: "claude-sonnet-4-20250514",
      system: this.getSystemPrompt(),
      messages: this.formatHistory(history, message),
      tools,
      max_tokens: 4096,
    });

    // Handle tool use
    if (response.stop_reason === "tool_use") {
      return this.handleToolUse(response, conversationId);
    }

    // Return text response
    const textContent = response.content.find((c) => c.type === "text");
    return textContent?.text ?? "";
  }

  private async handleToolUse(
    response: Message,
    conversationId: string,
  ): Promise<string> {
    const toolUse = response.content.find((c) => c.type === "tool_use");

    // Execute tool via MCP
    const result = await this.mcpService.executeTool(
      toolUse.name,
      toolUse.input,
    );

    // Continue conversation with tool result
    return this.chat(JSON.stringify({ tool_result: result }), conversationId);
  }

  private getSystemPrompt(): string {
    return `You are a helpful assistant with access to a personal knowledge management system.
You can search, create, and manage content using the available tools.
Be concise and helpful. Use tools when they would help answer the user's question.`;
  }
}
```

### Simplified CLI

```typescript
// interfaces/cli/src/cli-interface.ts

export class CLIInterface extends InterfacePlugin {
  private agentService!: AgentService;
  private conversationId!: string;

  async register(context: InterfacePluginContext): Promise<PluginCapabilities> {
    this.agentService = context.resolve("agentService");
    this.conversationId = await this.startConversation();

    return {
      daemons: [{
        name: "cli",
        start: () => this.startCLI(),
        stop: () => this.stopCLI(),
      }],
    };
  }

  private async startCLI(): Promise<void> {
    // Render Ink chat component
    render(<Chat onSubmit={this.handleInput.bind(this)} />);
  }

  private async handleInput(input: string): Promise<void> {
    // That's it. Just send to agent.
    const response = await this.agentService.chat(input, this.conversationId);
    this.displayResponse(response);
  }
}
```

## Success Criteria

- [ ] AgentService created and working
- [ ] CLI uses agent instead of commands
- [ ] Matrix uses agent instead of commands
- [ ] Commands removed from codebase
- [ ] User can accomplish all tasks via natural language
- [ ] Response streaming works
- [ ] Destructive operations require confirmation
- [ ] Tests pass
- [ ] Documentation updated

## Risks & Mitigations

| Risk                           | Mitigation                                     |
| ------------------------------ | ---------------------------------------------- |
| AI hallucinations              | Clear system prompts, tool-based grounding     |
| Cost increase (more API calls) | Efficient prompting, caching where appropriate |
| Slower than commands           | Streaming responses, optimize prompts          |
| Users miss commands            | Keep as hidden fallback initially              |
| Tool errors confuse agent      | Good error messages, retry logic               |

## Timeline

**Phase 1**: AgentService - 1-2 days
**Phase 2**: CLI migration - 1 day
**Phase 3**: Matrix migration - 1 day
**Phase 4**: Command cleanup - 0.5 days
**Phase 5**: Enhancements - ongoing

**Total**: ~4-5 days for core implementation

## Open Questions

1. Should we use Anthropic SDK directly or go through our existing AIService?
2. How do we handle rate limits and API errors gracefully?
3. Should different brains have different agent personalities?
4. Do we need a way to "force" tool execution without AI interpretation?
5. How do we test agent behavior reliably?

## References

- Current CLI implementation: `interfaces/cli/`
- Current Matrix implementation: `interfaces/matrix/`
- MCP Service: `shell/mcp-service/`
- AI Service: `shell/ai-service/`
- Anthropic Tool Use docs: https://docs.anthropic.com/claude/docs/tool-use
