# Plan: enforce tool response schema at the agent-service boundary

## Status

Not started. Audit complete: 19/19 tool handlers currently produce shapes compliant with `toolResponseSchema`. No tool fixes required; the work is purely the addition of a validation gate.

## Problem

`shell/mcp-service/src/types.ts` defines a strict contract for tool responses:

```ts
toolResponseSchema = z.union([
  toolSuccessSchema, // { success: true,  data, message? }
  toolErrorSchema, // { success: false, error: string, code? }
  toolConfirmationSchema, // { needsConfirmation: true, toolName, description, args }
]);
```

But the agent-service uses a loose runtime check:

```ts
function isFailedToolOutput(value: unknown): boolean {
  return isRecord(value) && value["success"] === false;
}
```

The runtime check is strictly more permissive than the schema. A tool that returns `{ success: false }` with no `error` field passes `isFailedToolOutput` but violates `toolErrorSchema`. The contract exists; nothing currently enforces it. Symptoms are minor today (e.g., degraded failure text when an error message is missing) but the boundary will rot silently as new tools are added.

## Goal

Enforce `toolResponseSchema.safeParse` at the boundary where tool handler results enter agent-service. Surface contract violations loudly instead of letting them produce degraded UX downstream.

## Non-goals

- No changes to tool author API. The contract is unchanged.
- No changes to existing tools. Audit shows all 19 are compliant.
- No enforcement for resource handlers (`{ contents: ... }`) or prompt handlers (`{ messages: ... }`) — different contracts, out of scope.

## Audit baseline

19/19 tool handlers compliant:

- ~13 tools route through `createSystemTool` (`shell/core/src/system/tool-helpers.ts`) or `createTool` (`shell/mcp-service/src/tool-helpers.ts`). Both helpers guarantee compliant shapes.
- ~6 tools (examples, mcp-bridge) construct compliant shapes manually.
- 0 tools return ad-hoc shapes (`{ result: ... }`, bare strings, undefined).

This baseline means the validation gate can land without any tool-side migration.

## Desired model

Wrap tool handler invocation once, at the central execution point in mcp-service. On parse failure, coerce to a synthetic `toolError`:

```ts
async function executeToolWithValidation(
  tool: Tool,
  args: unknown,
  context: ToolContext,
): Promise<ToolResponse> {
  const raw = await tool.handler(args, context);
  const parsed = toolResponseSchema.safeParse(raw);
  if (parsed.success) return parsed.data;

  logger.error("Tool returned non-compliant response", {
    toolName: tool.name,
    issues: parsed.error.issues,
  });
  return {
    success: false,
    error: `Tool ${tool.name} returned an invalid response shape`,
  };
}
```

Once the gate is in place, `isFailedToolOutput` can be tightened to use the schema instead of duck-typing — or removed in favor of branching on the parsed discriminated union.

## Work involved

### 1. Add the validation gate

Relevant file:

```text
shell/mcp-service/src/mcp-service.ts
```

- Wrap the tool execution path with `toolResponseSchema.safeParse`.
- Define the failure policy: log + coerce to synthetic `toolError`. (Throwing would break the agent's tool-loop; silent pass-through defeats the point.)

### 2. Tighten downstream consumers

Relevant files:

```text
shell/ai-service/src/agent-service.ts
shell/ai-service/src/agent-results.ts
```

- Replace `isFailedToolOutput` with discrimination on the parsed shape, or keep it as a thin alias over `parsed.success === false`.
- Remove the no-error fallback hedging in failure-text formatting once the contract guarantees `error` is present.

### 3. Tests

```text
shell/mcp-service/test/mcp-service.test.ts
```

- Compliant success/error/confirmation responses pass through unchanged.
- Non-compliant response (e.g. `{ success: false }` with no error) is coerced to a synthetic toolError and logged.
- Each branch of `toolResponseSchema` is exercised at least once.

## Migration strategy

1. Land the gate with a coerce-to-error policy. No tool changes required (audit confirms compliance).
2. Tighten downstream consumers in the same slice — the gate guarantees parsed shape, so `isFailedToolOutput` and the failure-text fallback can simplify.
3. No bake period needed; the gate is purely additive and the audit baseline says it has nothing to coerce today.

## Risks

- **False positives on adjacent handler types.** Resource handlers (`{ contents: ... }`) and prompt handlers (`{ messages: ... }`) are not tool responses. The wrapper must be scoped to tool execution only, not generic MCP handler dispatch.
- **Future tool drift.** New tools written without going through `createSystemTool` / `createTool` could still return non-compliant shapes. The gate catches them but the right long-term answer is to make those helpers the only sanctioned construction path.
- **Hidden type loosening.** `Tool.handler` is currently typed as returning `unknown` in some places. Parsing tightens this at runtime but doesn't fix the static typing — worth a follow-up to type the handler return as `ToolResponse`.

## Estimated size

~50-80 LOC total: ~30 LOC in mcp-service for the gate, ~10-20 LOC in agent-service for tightening, ~30-40 LOC of tests. Half a day of work.
