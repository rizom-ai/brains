# Plan: enforce tool response schema at the agent-service boundary

## Status

Implemented in `feat/tool-response-validation`. The slice validates registered tool handler results, tightens `toolResponseSchema`, and validates MCP protocol/message-bus tool response envelopes separately from raw `ToolResponse` payloads. The previous draft also referenced stale downstream code (`isFailedToolOutput`) that no longer exists.

## Problem

`shell/mcp-service/src/types.ts` defines the intended contract for tool responses:

```ts
toolResponseSchema = z.union([
  toolSuccessSchema, // { success: true,  data, message? }
  toolErrorSchema, // { success: false, error: string, code? }
  toolConfirmationSchema, // { needsConfirmation: true, toolName, description, args }
]);
```

Agent-service already parses tool outputs in `shell/ai-service/src/agent-results.ts`, but that parse is downstream of execution and is mostly used to extract structured display data. It does not prevent a non-compliant handler result from reaching the model/tool loop, and the direct confirmed-action path currently calls the handler and stringifies whatever it returns.

There is also a schema sharp edge: with the current Zod version, `z.object({ data: z.unknown() })` accepts a missing `data` field, and object schemas strip unknown keys by default. So `toolResponseSchema.safeParse` is useful, but it is not as strict as the prose contract suggests unless the schemas are tightened.

## Goal

Validate registered tool handler results at the boundary before agent-service consumes them, and convert invalid results into a standard synthetic tool error:

```ts
{
  success: false,
  error: `Tool ${tool.name} returned an invalid response shape`,
}
```

The agent should continue its tool loop with a well-formed error instead of receiving an arbitrary shape.

## Non-goals

- No changes to the tool authoring API.
- No validation for resource handlers (`{ contents: ... }`) or prompt handlers (`{ messages: ... }`).
- No generic validation for all message-bus responses. External MCP tool calls go through `mcp-registration.ts` → message bus → `BasePlugin.setupMessageHandlers`, where the tool result is nested inside a `MessageResponse`; that envelope is validated only on the tool execution path.
- No broad plugin migration unless schema tightening reveals real production handlers returning non-compliant shapes.

## Current execution paths

Agent-visible tool execution uses registered `Tool.handler` functions from `IMCPService`:

1. **Normal agent tool calls**
   - `shell/ai-service/src/sdk-tools.ts`
   - `convertToSDKTools(...)` wraps each registered `Tool.handler` for the AI SDK.

2. **Confirmed actions**
   - `shell/ai-service/src/agent-service.ts`
   - `executeConfirmedAction(...)` looks up a registered tool and calls `tool.tool.handler(...)` directly.

3. **MCP protocol tool calls**
   - `shell/mcp-service/src/mcp-registration.ts`
   - Does not call `Tool.handler`; it sends a plugin message-bus request and serializes the message response. This path validates the message envelope separately, then validates/coerces the nested `ToolResponse` payload.

## Desired model

Add one mcp-service-owned helper that wraps registered tool handlers:

```ts
function wrapToolWithResponseValidation(
  pluginId: string,
  tool: Tool,
  logger: Logger,
): Tool {
  return {
    ...tool,
    handler: async (args, context) => {
      const raw = await tool.handler(args, context);
      const parsed = toolResponseSchema.safeParse(raw);
      if (parsed.success) return parsed.data;

      logger.error("Tool returned non-compliant response", {
        pluginId,
        toolName: tool.name,
        issues: parsed.error.issues,
      });

      return {
        success: false,
        error: `Tool ${tool.name} returned an invalid response shape`,
      };
    },
  };
}
```

Use this wrapper when storing tools in `MCPService.registerTool(...)`. Then both agent-service paths consume validated handlers through the existing `listTools*()` APIs without adding duplicate validation in ai-service.

## Work involved

### 1. Decide schema strictness for this slice

Relevant file:

```text
shell/mcp-service/src/types.ts
```

Implemented with schema tightening: success responses must include an own `data` key, response objects are strict, and missing `data` / extra keys are coerced to synthetic tool errors at runtime.

### 2. Add the registered-handler validation wrapper

Relevant files:

```text
shell/mcp-service/src/mcp-service.ts
shell/mcp-service/src/tool-response-validation.ts # or similar small helper file
```

- Wrap tools before placing them in `registeredTools`.
- Preserve tool metadata (`name`, `description`, `inputSchema`, `visibility`, `cli`, `outputSchema`).
- Log parse failures with plugin id, tool name, and Zod issues.
- Return a synthetic `toolError` instead of throwing.

### 3. Keep downstream parsing, but simplify only if still useful

Relevant file:

```text
shell/ai-service/src/agent-results.ts
```

`agent-results.ts` already parses `toolResponseSchema`. Keep that parse for structured extraction unless it becomes redundant after implementation. There is no `isFailedToolOutput` cleanup to do; that reference was stale.

### 4. Tests

Relevant tests:

```text
shell/mcp-service/test/mcp-service.test.ts
shell/ai-service/test/*tool*.test.ts # targeted existing tests where available
```

Add/adjust tests for:

- Compliant success/error/confirmation responses pass through unchanged from `listTools()` / `listToolsForPermissionLevel()` handlers.
- Non-compliant registered handler output is coerced to synthetic `toolError` and logs an error.
- Normal agent tool calls receive the coerced error through the SDK tool wrapper.
- Confirmed actions receive the coerced error when the confirmed handler returns an invalid shape.
- If schema strictness is tightened, stale test fixtures using extra fields or missing `data` are updated.

## Migration strategy

1. Extend the production handler audit if choosing schema tightening (cover missing `data` and silently-stripped extra keys, not just response-shape compliance).
2. Add the wrapper at registration time and update tests that compare stored tool object identity; wrapped tools should be compared by behavior/metadata instead.
3. Keep MCP protocol/message-bus behavior unchanged in this slice.
4. Optionally follow with a separate slice to validate/normalize message-bus tool envelopes if needed.

## Risks

- **Object identity changes.** Wrapping in `registerTool` means `listTools()[0].tool !== originalTool`. Existing tests or callers may need to assert metadata/behavior instead of identity.
- **Schema permissiveness.** If `toolResponseSchema` is not tightened, the gate will not catch every shape the prose contract calls invalid.
- **False positives if protocol envelopes are validated.** Do not apply `toolResponseSchema` to `MessageResponse` envelopes from MCP protocol dispatch; unwrap or scope separately.
- **Hidden public helper drift.** `shell/plugins/src/public/types.ts` exposes a looser `ToolResponse` helper shape. If external plugin authoring flows feed directly into runtime `Tool.handler`, schema tightening could reveal mismatches.

## Estimated size

~80-140 LOC depending on schema tightening and test fixture updates. Expected files touched: mcp-service types/helper/tests, plus targeted ai-service tests for the two agent execution paths.
