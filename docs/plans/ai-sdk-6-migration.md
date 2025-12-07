# Plan: Migrate Agent to Vercel AI SDK 6 Beta with ToolLoopAgent

## Summary

Upgrade from AI SDK 5's manual `generateText` + step iteration to AI SDK 6's `ToolLoopAgent` class, which provides built-in tool loop orchestration, type-safe runtime configuration via `callOptionsSchema`, and cleaner permission-based tool filtering.

## Key Benefits

1. **No more manual step iteration** - ToolLoopAgent handles tool loops automatically
2. **Type-safe call options** - `callOptionsSchema` for userPermissionLevel, conversationId
3. **Dynamic tool filtering** - `prepareCall` + `activeTools` to filter by permission
4. **Cleaner architecture** - Agent configuration encapsulated in factory function

## Files to Modify

| File                                       | Change                                                            |
| ------------------------------------------ | ----------------------------------------------------------------- |
| `shell/ai-service/package.json`            | Upgrade `ai` to `6.0.0-beta.10`                                   |
| `shell/agent-service/package.json`         | Add direct `ai` dependency                                        |
| `shell/ai-service/src/aiService.ts`        | Remove `generateWithTools`, expose `getModel()`                   |
| `shell/ai-service/src/types.ts`            | Simplify `IAIService`, remove tool-related types                  |
| `shell/agent-service/src/brain-agent.ts`   | **NEW**: ToolLoopAgent factory with callOptionsSchema             |
| `shell/agent-service/src/agent-service.ts` | Use `agent.generate()` instead of `aiService.generateWithTools()` |
| `shell/agent-service/test/*.test.ts`       | Update mocks for new agent pattern                                |

## Implementation Steps

### Phase 1: Package Updates

1. Pin `ai` to `6.0.0-beta.10` (not `@beta` to avoid breaking changes)
2. Update `@ai-sdk/anthropic` to compatible beta version
3. Run `bun install` and verify no conflicts

### Phase 2: Create BrainAgent Factory

**New file: `shell/agent-service/src/brain-agent.ts`**

```typescript
import { ToolLoopAgent, tool, stepCountIs } from "ai";
import { z } from "@brains/utils";

export const brainCallOptionsSchema = z.object({
  userPermissionLevel: z.enum(["anchor", "trusted", "public"]),
  conversationId: z.string(),
  channelId: z.string().optional(),
  interfaceType: z.string(),
});

export function createBrainAgent(config: {
  model: LanguageModel;
  identity: IdentityBody;
  tools: PluginTool[];
  maxSteps?: number;
  getToolsForPermission: (level) => PluginTool[];
}) {
  return new ToolLoopAgent({
    model: config.model,
    callOptionsSchema: brainCallOptionsSchema,
    prepareCall: ({ options, ...settings }) => ({
      ...settings,
      instructions: buildInstructions(
        config.identity,
        options.userPermissionLevel,
      ),
      activeTools: config
        .getToolsForPermission(options.userPermissionLevel)
        .map((t) => t.name),
    }),
    tools: convertToSDKTools(config.tools),
    stopWhen: stepCountIs(config.maxSteps ?? 10),
  });
}
```

### Phase 3: Refactor AgentService

**Key changes to `agent-service.ts`:**

1. Add lazy agent initialization:

```typescript
private agent: ToolLoopAgent | null = null;

private getAgent(): ToolLoopAgent {
  if (!this.agent) {
    this.agent = createBrainAgent({
      model: this.aiService.getModel(),
      identity: this.identityService.getIdentity(),
      tools: this.mcpService.listTools(),
      maxSteps: this.config.maxSteps,
      getToolsForPermission: (level) => this.mcpService.listToolsForPermissionLevel(level),
    });
  }
  return this.agent;
}
```

2. Replace `aiService.generateWithTools()` call:

```typescript
const result = await this.getAgent().generate({
  prompt: message,
  messages: historyMessages,
  options: {
    userPermissionLevel,
    conversationId,
    channelId,
    interfaceType,
  },
});
```

3. Add `invalidateAgent()` method for tool registration changes

### Phase 4: Simplify AIService

Remove from `aiService.ts`:

- `generateWithTools()` method (lines 179-287)
- Manual step iteration logic
- `dynamicTool` import

Add to `aiService.ts`:

- `getModel(): LanguageModel` - expose model for agent
- Keep `generateText()` and `generateObject()` for non-agent use

### Phase 5: Update Tests

1. Remove `generateWithTools` tests from AIService
2. Mock `ToolLoopAgent.generate()` in AgentService tests
3. Add unit tests for `brainCallOptionsSchema` validation
4. Verify tool result extraction from `result.steps`

## Risks & Mitigations

| Risk                    | Mitigation                                         |
| ----------------------- | -------------------------------------------------- |
| Beta API changes        | Pin specific version `6.0.0-beta.10`               |
| Breaking tool format    | Isolate conversion in `brain-agent.ts`             |
| Interface compatibility | Keep `IAgentService` and `AgentResponse` unchanged |

## Rollback Strategy

Keep feature flag during migration:

```typescript
const USE_TOOL_LOOP_AGENT = process.env.USE_TOOL_LOOP_AGENT !== "false";
```

Keep legacy `generateWithTools` in separate file until stable.

## Sources

- [AI SDK 6 Beta Announcement](https://v6.ai-sdk.dev/docs/introduction/announcing-ai-sdk-6-beta)
- [Agents: Configuring Call Options](https://v6.ai-sdk.dev/docs/agents/configuring-call-options)
- [Agents: Loop Control](https://ai-sdk.dev/docs/agents/loop-control)
