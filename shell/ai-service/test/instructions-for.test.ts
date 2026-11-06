import { describe, expect, it, mock } from "bun:test";
import { MockLanguageModelV3 } from "ai/test";
import { createMockMCPService } from "@brains/mcp-service/test";
import { createMockMessageBus } from "@brains/messaging-service/test";
import { createSilentLogger } from "@brains/test-utils";
import type { UserPermissionLevel } from "@brains/templates";
import { AgentService } from "../src/agent-service";
import { createBrainAgentFactory } from "../src/brain-agent";
import type { BrainAgentFactory } from "../src/agent-types";
import type { AgentConversationStore } from "../src/turn-processor";

type ModelResponse = Awaited<ReturnType<MockLanguageModelV3["doGenerate"]>>;

function answer(): ModelResponse {
  return {
    content: [{ type: "text", text: "Hello." }],
    finishReason: { unified: "stop", raw: "stop" },
    usage: {
      inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 },
      outputTokens: { total: 1, text: 1, reasoning: 0 },
    },
    warnings: [],
  };
}

function createService(agentFactory: BrainAgentFactory): AgentService {
  const mcpService = createMockMCPService();
  mcpService.getInstructions = mock(() => ["Plugin guidance."]);
  return AgentService.createFresh(
    mcpService,
    {
      startConversation: mock(() => Promise.resolve("conv-1")),
      addMessage: mock(() => Promise.resolve()),
      getMessages: mock(() => Promise.resolve([])),
      getConversation: mock(() => Promise.resolve(null)),
    } satisfies AgentConversationStore,
    {
      getCharacter: () => ({
        name: "Test Brain",
        role: "Researcher",
        purpose: "Answer questions",
        values: ["clarity"],
      }),
    },
    {
      getProfile: () => ({
        name: "Test Anchor",
        email: "anchor@example.com",
        description: "Owner",
      }),
    },
    createSilentLogger(),
    { agentFactory, agentInstructions: ["Brain guidance."] },
  );
}

function systemPrompt(model: MockLanguageModelV3): unknown {
  const [message] = model.doGenerateCalls[0]?.prompt ?? [];
  return message?.role === "system" ? message.content : undefined;
}

describe("AgentService.instructionsFor", () => {
  const cases: Array<[UserPermissionLevel, boolean]> = [
    ["public", false],
    ["trusted", false],
    ["admin", true],
  ];

  it.each(cases)(
    "returns the exact %s instructions the agent sends (anchor: %p)",
    async (level, isAnchor) => {
      const model = new MockLanguageModelV3({
        doGenerate: async (): Promise<ModelResponse> => answer(),
      });
      const service = createService(
        createBrainAgentFactory({ model, messageBus: createMockMessageBus() }),
      );

      await service.chat("Hi", "conv-1", {
        userPermissionLevel: level,
        isAnchor,
        interfaceType: "cli",
      });

      expect(systemPrompt(model)).toBe(
        service.instructionsFor(level, { isAnchor }),
      );
    },
  );

  it("reports instructions without building an agent", () => {
    const agentFactory = mock<BrainAgentFactory>(() => ({
      generate: mock(async () => ({
        text: "",
        steps: [],
        usage: {
          inputTokens: undefined,
          outputTokens: undefined,
          totalTokens: undefined,
        },
      })),
    }));
    const service = createService(agentFactory);

    const instructions = service.instructionsFor("admin", { isAnchor: false });

    expect(agentFactory).not.toHaveBeenCalled();
    expect(instructions).toContain("# Test Brain");
    expect(instructions).toContain("**Admin**");
    expect(instructions).toContain("anchor@example.com");
    expect(instructions).toContain("Brain guidance.");
    expect(instructions).toContain("Plugin guidance.");
  });
});
