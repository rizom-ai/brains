# A2A Interface Plugin

## Overview

New interface plugin at `interfaces/a2a/` implementing the [A2A protocol](https://a2a-protocol.org/latest/specification/). Serves a dynamically generated Agent Card for discovery and accepts tasks via JSON-RPC 2.0 over HTTP. Routes tasks through AgentService (like Matrix/Discord), not through direct tool invocation (like MCP).

## MCP vs A2A

| Concept      | MCP                                     | A2A                                          |
| ------------ | --------------------------------------- | -------------------------------------------- |
| Discovery    | Client knows server's tools             | Agent Card at `/.well-known/agent-card.json` |
| Capabilities | Tools (structured input/output schemas) | Skills (name + description, no schema)       |
| Invocation   | Direct tool call with params            | Task with a text message                     |
| Processing   | Tool handler executes directly          | AgentService decides which tools to use      |
| Response     | Structured tool result                  | Message with text/files/data parts           |
| Streaming    | SSE                                     | SSE                                          |
| Auth         | Bearer token                            | Bearer token / mutual Agent Card             |

A2A is conversational — closer to Matrix/Discord than to MCP. The interface receives a message, passes it to AgentService, and returns the agent's response as a task result.

## Architecture

```
External Agent → Agent Card discovery (GET /.well-known/agent-card.json)
              → Task request (POST /a2a, JSON-RPC 2.0)
              → A2AInterface authenticates caller (domain-based)
              → PermissionService filters available tools
              → AgentService processes task
              → Response streamed back via SSE or returned as JSON

Brain's AgentService → a2a_call tool → discovers remote Agent Card
                                     → sends task via JSON-RPC 2.0
                                     → returns result
```

## Package Structure

```
interfaces/a2a/
  package.json
  tsconfig.json
  src/
    index.ts              # exports A2AInterface
    config.ts             # Zod schema for config
    a2a-interface.ts      # InterfacePlugin implementation
    agent-card.ts         # Dynamic Agent Card generation
    jsonrpc-handler.ts    # JSON-RPC 2.0 request handler
    task-manager.ts       # Task lifecycle state machine
    client.ts             # A2A client (discover + call remote agents)
    types.ts              # A2A protocol types
  test/
    a2a-interface.test.ts
    agent-card.test.ts
    jsonrpc-handler.test.ts
    task-manager.test.ts
    client.test.ts
```

## Key Components

### Agent Card (`agent-card.ts`)

Generated dynamically at runtime after all plugins have registered (`system:plugins:ready`). Reflects the current state of the brain's capabilities — add a plugin, the card updates automatically.

Built from existing data:

- `name`, `description` ← `BrainCharacterService`
- `url` ← deployment domain
- `skills` ← registered tools (filtered by public permission level)
- `version` ← brain definition version

```json
{
  "name": "Rover",
  "description": "Personal knowledge manager and professional content curator",
  "url": "https://yeehaa.io",
  "provider": { "organization": "rizom.ai" },
  "version": "1.0.0",
  "capabilities": {
    "streaming": true,
    "pushNotifications": false
  },
  "authentication": {
    "schemes": ["bearer"]
  },
  "skills": [
    {
      "id": "blog_generate",
      "name": "Generate Blog Post",
      "description": "..."
    },
    { "id": "system_search", "name": "Search Knowledge", "description": "..." }
  ]
}
```

### Task Manager (`task-manager.ts`)

Manages task lifecycle per the A2A spec:

```
submitted → working → completed
                    → failed
                    → canceled
```

Each task has an ID, maps to a conversation in AgentService. Supports:

- Synchronous completion (short tasks)
- Streaming via SSE (long tasks)
- Task status polling

### JSON-RPC Handler (`jsonrpc-handler.ts`)

Standard A2A methods:

- `tasks/send` — submit a task (message → AgentService)
- `tasks/get` — get task status/result
- `tasks/cancel` — cancel a running task
- `tasks/sendSubscribe` — submit + stream updates via SSE

### A2A Client (`client.ts`)

Discovers remote agents and sends tasks. Exposed as an `a2a_call` tool registered on AgentService, so any interface can trigger it:

- Matrix user: "ask the rover brain to write a post about X"
- AgentService picks `a2a_call` tool
- Client fetches remote Agent Card, sends task, returns result

```ts
// Tool: a2a_call
// Input: { agent: "https://yeehaa.io", message: "Write a blog post about..." }
// Output: task result from remote agent
```

### Config

```ts
const a2aConfigSchema = z.object({
  port: z.number().default(3334),
  authToken: z.string().optional(),
});
```

### Permission Integration

Uses existing `PermissionService` with `a2a` as interface type:

```ts
permissions: {
  rules: [
    { pattern: "a2a:*.rizom.ai", level: "anchor" },
    { pattern: "a2a:mylittlephoney.com", level: "trusted" },
    { pattern: "a2a:*", level: "public" },
  ],
}
```

Caller identified by domain from their Agent Card or bearer token.

Agent Card only advertises public-level skills. Authenticated agents get more tools at runtime.

### Daemon

Own HTTP server (Hono) on its own port (like MCP). Serves:

- `GET /.well-known/agent-card.json` — Agent Card (dynamic)
- `POST /a2a` — JSON-RPC 2.0 endpoint

## Implementation Order

1. **Types + config** — A2A protocol types, config schema
2. **Agent Card** — dynamic generation from brain identity + tools, tests
3. **Task Manager** — task lifecycle state machine, tests
4. **JSON-RPC handler** — request parsing, method dispatch, tests
5. **A2A Interface plugin** — daemon, registration, wiring
6. **A2A Client** — discovery, task sending, `a2a_call` tool
7. **Integration test** — two local brains communicating

## Dependencies

- `hono` — HTTP server (already in use by webserver/MCP)
- No A2A SDK needed — the protocol is simple JSON-RPC 2.0

## Estimated Effort

~2-3 days for a working implementation.
