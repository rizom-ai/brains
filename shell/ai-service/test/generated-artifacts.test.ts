import { describe, expect, it, mock } from "bun:test";
import { z } from "@brains/utils";
import { createSilentLogger } from "@brains/test-utils";
import { MCPService, type Tool } from "@brains/mcp-service";
import type { IConversationService } from "@brains/conversation-service";
import type {
  AnchorProfile,
  IAnchorProfileService,
  IBrainCharacterService,
} from "@brains/identity-service";
import { AgentService } from "../src/agent-service";
import { buildAttachmentCardFromToolData } from "../src/agent-results";
import type { BrainAgentFactory, BrainAgentResult } from "../src/agent-types";
import { toModelToolOutput } from "../src/sdk-tools";

const usage: BrainAgentResult["usage"] = {
  inputTokens: 10,
  outputTokens: 5,
  totalTokens: 15,
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

describe("generated artifact cards", () => {
  it("does not describe uploaded image promotion as image generation", () => {
    const card = buildAttachmentCardFromToolData({
      entityId: "download",
      status: "generating",
      jobId: "job-upload",
      attachment: {
        mediaType: "image/png",
        url: "/api/chat/attachments/image?id=download",
        downloadUrl: "/api/chat/attachments/image?id=download&download=1",
        filename: "download.png",
        source: {
          entityType: "image",
          entityId: "download",
          attachmentType: "uploaded",
        },
      },
    });

    expect(card).toEqual(
      expect.objectContaining({
        kind: "attachment",
        title: "download.png",
        description:
          "Uploaded image save has been queued. This artifact will open once the job completes.",
      }),
    );
  });
});

describe("generated artifact tool loop", () => {
  it("keeps attachment URLs available for cards while hiding them from model-visible tool results", async () => {
    const storedArtifacts = new Map<string, Buffer>();
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
    const toolOutput = await documentGenerate.handler(
      {
        sourceEntityType: "deck",
        sourceEntityId: "deck-1",
        attachmentType: "carousel",
      },
      {
        interfaceType: "agent",
        userId: "agent-user",
        conversationId: "conv-1",
        channelId: "conv-1",
      },
    );
    const modelVisibleOutput = JSON.stringify(toModelToolOutput(toolOutput));
    expect(modelVisibleOutput).not.toContain("/api/chat/attachments");
    expect(modelVisibleOutput).toContain("artifactCard");
    expect(modelVisibleOutput).toContain("Open and Download controls");

    const agentFactory: BrainAgentFactory = () => ({
      generate: mock(
        async (): Promise<BrainAgentResult> => ({
          text: "Done — the artifact card is ready.",
          steps: [
            {
              toolCalls: [
                {
                  toolCallId: "call-1",
                  toolName: "document_generate",
                  input: {
                    sourceEntityType: "deck",
                    sourceEntityId: "deck-1",
                    attachmentType: "carousel",
                  },
                },
              ],
              toolResults: [
                {
                  toolCallId: "call-1",
                  toolName: "document_generate",
                  output: toolOutput,
                },
              ],
            },
          ],
          usage,
        }),
      ),
    });

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
        agentFactory,
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
  });
});
