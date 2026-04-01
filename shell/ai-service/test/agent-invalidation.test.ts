import { describe, it, expect, beforeEach, mock } from "bun:test";
import { AgentService } from "../src/agent-service";
import { createSilentLogger } from "@brains/test-utils";
import type { IMCPService } from "@brains/mcp-service";
import type {
  IBrainCharacterService,
  IAnchorProfileService,
} from "@brains/identity-service";
import type { IConversationService } from "@brains/conversation-service";
import type { BrainAgentConfig } from "../src/brain-agent";
import type { BrainAgent } from "../src/agent-types";

function createMockMCPService(): IMCPService {
  return {
    registerTool: mock(() => {}),
    registerResource: mock(() => {}),
    registerResourceTemplate: mock(() => {}),
    registerPrompt: mock(() => {}),
    registerInstructions: mock(() => {}),
    getInstructions: mock(() => []),
    listTools: mock(() => []),
    getCliTools: mock(() => []),
    listToolsForPermissionLevel: mock(() => []),
    listResources: mock(() => []),
    getMcpServer: mock(() => ({})),
    createMcpServer: mock(() => ({})),
    setPermissionLevel: mock(() => {}),
  } as unknown as IMCPService;
}

describe("AgentService invalidation", () => {
  let agentFactoryCalls: number;

  beforeEach(() => {
    AgentService.resetInstance();
    agentFactoryCalls = 0;
  });

  function createService(): AgentService {
    const mockAgentFactory = (_config: BrainAgentConfig): BrainAgent => {
      agentFactoryCalls++;
      return {
        generate: mock(() =>
          Promise.resolve({
            text: "response",
            steps: [],
            usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
          }),
        ),
      };
    };

    return AgentService.createFresh(
      createMockMCPService(),
      {
        startConversation: mock(() => Promise.resolve("conv-1")),
        addMessage: mock(() => Promise.resolve()),
        getMessages: mock(() => Promise.resolve([])),
        getConversation: mock(() => Promise.resolve(null)),
        searchConversations: mock(() => Promise.resolve([])),
      } as unknown as IConversationService,
      {
        getCharacter: () => ({
          name: "Test Brain",
          role: "Test",
          purpose: "Test",
          values: [],
        }),
      } as IBrainCharacterService,
      {
        getProfile: () => ({
          name: "Test Anchor",
          kind: "professional" as const,
          description: "Test",
        }),
      } as IAnchorProfileService,
      createSilentLogger(),
      { agentFactory: mockAgentFactory },
    );
  }

  it("should rebuild agent after invalidateAgent is called", async () => {
    const service = createService();

    // First chat creates the agent
    await service.chat("hello", "conv-1");
    expect(agentFactoryCalls).toBe(1);

    // Second chat reuses cached agent
    await service.chat("hello again", "conv-1");
    expect(agentFactoryCalls).toBe(1);

    // Invalidate
    service.invalidateAgent();

    // Third chat rebuilds the agent
    await service.chat("hello once more", "conv-1");
    expect(agentFactoryCalls).toBe(2);
  });

  it("should pick up new profile data after invalidation", async () => {
    let profileName = "Original Name";
    const mockProfileService: IAnchorProfileService = {
      getProfile: () => ({
        name: profileName,
        kind: "professional" as const,
        description: "Test",
      }),
    };

    const capturedConfigs: BrainAgentConfig[] = [];
    const mockAgentFactory = (config: BrainAgentConfig): BrainAgent => {
      capturedConfigs.push(config);
      return {
        generate: mock(() =>
          Promise.resolve({
            text: "response",
            steps: [],
            usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
          }),
        ),
      };
    };

    const service = AgentService.createFresh(
      createMockMCPService(),
      {
        startConversation: mock(() => Promise.resolve("conv-1")),
        addMessage: mock(() => Promise.resolve()),
        getMessages: mock(() => Promise.resolve([])),
        getConversation: mock(() => Promise.resolve(null)),
        searchConversations: mock(() => Promise.resolve([])),
      } as unknown as IConversationService,
      {
        getCharacter: () => ({
          name: "Brain",
          role: "Test",
          purpose: "Test",
          values: [],
        }),
      } as IBrainCharacterService,
      mockProfileService,
      createSilentLogger(),
      { agentFactory: mockAgentFactory },
    );

    await service.chat("hello", "conv-1");
    expect(capturedConfigs[0]?.profile?.name).toBe("Original Name");

    // Change profile data and invalidate
    profileName = "Updated Name";
    service.invalidateAgent();

    await service.chat("hello again", "conv-1");
    expect(capturedConfigs[1]?.profile?.name).toBe("Updated Name");
  });
});
