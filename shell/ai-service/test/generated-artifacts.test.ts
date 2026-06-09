import { describe, expect, it, mock } from "bun:test";
import { MockLanguageModelV3 } from "ai/test";
import type {
  LanguageModelV3CallOptions,
  LanguageModelV3GenerateResult,
  LanguageModelV3Usage,
} from "@ai-sdk/provider";
import { z } from "@brains/utils";
import { createSilentLogger } from "@brains/test-utils";
import type { IMessageBus } from "@brains/messaging-service";
import { MCPService, type Tool } from "@brains/mcp-service";
import type { IConversationService } from "@brains/conversation-service";
import type {
  AnchorProfile,
  IAnchorProfileService,
  IBrainCharacterService,
} from "@brains/identity-service";
import { createBrainAgentFactory } from "../src/brain-agent";
import { AgentService } from "../src/agent-service";

const usage: LanguageModelV3Usage = {
  inputTokens: {
    total: 10,
    noCache: 10,
    cacheRead: undefined,
    cacheWrite: undefined,
  },
  outputTokens: {
    total: 5,
    text: 5,
    reasoning: undefined,
  },
};

const toolCallResult: LanguageModelV3GenerateResult = {
  content: [
    {
      type: "tool-call",
      toolCallId: "call-1",
      toolName: "document_generate",
      input: JSON.stringify({
        sourceEntityType: "deck",
        sourceEntityId: "deck-1",
        attachmentType: "carousel",
      }),
    },
  ],
  finishReason: { unified: "tool-calls", raw: "tool_calls" },
  usage,
  warnings: [],
};

const finalTextResult: LanguageModelV3GenerateResult = {
  content: [{ type: "text", text: "Done — the artifact card is ready." }],
  finishReason: { unified: "stop", raw: "stop" },
  usage,
  warnings: [],
};

function createConversationService(): IConversationService {
  return {
    startConversation: mock(async () => "conversation-1"),
    addMessage: mock(async () => undefined),
    getMessages: mock(async () => []),
    countMessages: mock(async () => 0),
    getConversation: mock(async () => null),
    listConversations: mock(async () => []),
    searchConversations: mock(async () => []),
    updateConversationMetadata: mock(async () => false),
    deleteConversation: mock(async () => false),
    close: mock(() => undefined),
  };
}

function createCharacterService(): IBrainCharacterService {
  return {
    getCharacter: mock(() => ({
      name: "Test Brain",
      role: "Test assistant",
      purpose: "Help with generated artifact testing",
      values: ["accuracy"],
    })),
  };
}

function createProfileService(): IAnchorProfileService {
  return {
    getProfile: mock(
      (): AnchorProfile => ({
        name: "Test Anchor",
        kind: "professional",
        description: "Test",
      }),
    ),
  };
}

function createNoopUnsubscribe(): () => void {
  return (): void => undefined;
}

function createMessageBus(): IMessageBus {
  return {
    send: mock(async () => ({ success: true })),
    subscribe: mock(() => createNoopUnsubscribe()),
    unsubscribe: mock(() => undefined),
  };
}

describe("generated artifact tool loop", () => {
  it("keeps attachment URLs available for cards while hiding them from model-visible tool results", async () => {
    const modelCalls: LanguageModelV3CallOptions[] = [];
    const storedArtifacts = new Map<string, Buffer>();
    const model = new MockLanguageModelV3({
      doGenerate: async (options): Promise<LanguageModelV3GenerateResult> => {
        modelCalls.push(options);
        return modelCalls.length === 1 ? toolCallResult : finalTextResult;
      },
    });
    const documentGenerate: Tool = {
      name: "document_generate",
      description: "Generate a PDF document artifact",
      inputSchema: {
        sourceEntityType: z.string(),
        sourceEntityId: z.string(),
        attachmentType: z.string(),
      },
      visibility: "public",
      handler: mock(async (): Promise<{ success: true; data: unknown }> => {
        storedArtifacts.set("deck-carousel", Buffer.from("%PDF-1.7\n%EOF\n"));
        return {
          success: true,
          data: {
            jobId: "job-1",
            documentId: "deck-carousel",
            attachment: {
              mediaType: "application/pdf",
              url: "/api/chat/attachments/document?id=deck-carousel",
              downloadUrl:
                "/api/chat/attachments/document?id=deck-carousel&download=1",
              filename: "deck-carousel.pdf",
              source: {
                entityType: "document",
                entityId: "deck-carousel",
                attachmentType: "carousel",
              },
            },
          },
        };
      }),
    };
    const logger = createSilentLogger();
    const mcpService = MCPService.createFresh(
      {
        send: mock(async () => ({ success: true })),
        subscribe: mock(() => createNoopUnsubscribe()),
        unsubscribe: mock(() => undefined),
      },
      logger,
    );
    mcpService.registerTool("document", documentGenerate);
    const service = AgentService.createFresh(
      mcpService,
      createConversationService(),
      createCharacterService(),
      createProfileService(),
      logger,
      {
        agentFactory: createBrainAgentFactory({
          model,
          messageBus: createMessageBus(),
        }),
      },
    );

    const response = await service.chat("Generate a carousel PDF", "conv-1");

    expect(response.text).toBe("Done — the artifact card is ready.");
    expect(response.cards).toEqual([
      {
        kind: "attachment",
        id: "attachment:deck-carousel",
        jobId: "job-1",
        title: "deck-carousel.pdf",
        description:
          "PDF generation has been queued. This artifact will open once the job completes.",
        attachment: {
          mediaType: "application/pdf",
          url: "/api/chat/attachments/document?id=deck-carousel",
          downloadUrl:
            "/api/chat/attachments/document?id=deck-carousel&download=1",
          filename: "deck-carousel.pdf",
          source: {
            entityType: "document",
            entityId: "deck-carousel",
            attachmentType: "carousel",
          },
        },
      },
    ]);
    expect(storedArtifacts.get("deck-carousel")?.toString()).toBe(
      "%PDF-1.7\n%EOF\n",
    );
    expect(modelCalls.length).toBe(2);
    const secondModelPrompt = JSON.stringify(modelCalls[1]?.prompt);
    expect(secondModelPrompt).not.toContain("/api/chat/attachments");
    expect(secondModelPrompt).toContain("artifactCard");
    expect(secondModelPrompt).toContain("Open and Download controls");
  });
});
