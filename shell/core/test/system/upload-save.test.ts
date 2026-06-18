import { describe, expect, it } from "bun:test";
import type { IConversationService } from "@brains/conversation-service";
import type { Tool, ToolContext, ToolResponse } from "@brains/mcp-service";
import type { SystemServices } from "../../src/system/types";
import { createSystemTools } from "../../src/system/tools";
import { createMockSystemServices } from "./mock-services";

const uploadId = "upload-00000000-0000-4000-8000-000000000111";

function conversationWithUpload(): IConversationService {
  return {
    startConversation: async () => "conv-1",
    addMessage: async () => undefined,
    getMessages: async () => [
      {
        id: "message-1",
        conversationId: "conv-1",
        role: "user",
        content: "uploaded report.pdf",
        timestamp: new Date(0).toISOString(),
        metadata: JSON.stringify({
          attachments: [
            {
              kind: "file",
              filename: "report.pdf",
              mediaType: "application/pdf",
              source: { kind: "upload", id: uploadId },
            },
          ],
        }),
      },
    ],
    countMessages: async () => 1,
    getConversation: async () => null,
    listConversations: async () => [],
    updateConversationMetadata: async () => false,
    deleteConversation: async () => false,
    searchConversations: async () => [],
    close: () => undefined,
  };
}

function buildServices(input: {
  mediaType?: string;
  uploadHandler?: (input: unknown, context: unknown) => Promise<ToolResponse>;
}): ReturnType<typeof createMockSystemServices> {
  const base = createMockSystemServices();
  const mediaType = input.mediaType ?? "application/pdf";
  const runtimeUploads = {
    scoped: (): {
      readRecord: () => Promise<{
        id: string;
        ref: { kind: string; id: string };
        filename: string;
        mediaType: string;
        sizeBytes: number;
        createdAt: string;
      }>;
    } => ({
      readRecord: async (): Promise<{
        id: string;
        ref: { kind: string; id: string };
        filename: string;
        mediaType: string;
        sizeBytes: number;
        createdAt: string;
      }> => ({
        id: uploadId,
        ref: { kind: "upload", id: uploadId },
        filename: "report.pdf",
        mediaType,
        sizeBytes: 12,
        createdAt: new Date(0).toISOString(),
      }),
    }),
  };
  const entityRegistry = {
    ...base.entityRegistry,
    getUploadSaveHandler: (
      requestedMediaType: string,
    ):
      | {
          entityType: string;
          mediaTypes: string[];
          handler: (input: unknown, context: unknown) => Promise<ToolResponse>;
        }
      | undefined =>
      input.uploadHandler && requestedMediaType === mediaType
        ? {
            entityType: "document",
            mediaTypes: [mediaType],
            handler: input.uploadHandler,
          }
        : undefined,
  };

  return createMockSystemServices({
    conversationService: conversationWithUpload(),
    runtimeUploads,
    entityRegistry,
  } as unknown as Partial<SystemServices>);
}

function getUploadSaveTool(tools: Tool[]): Tool {
  const tool = tools.find(
    (candidate) => candidate.name === "system_upload_save",
  );
  if (!tool) throw new Error("system_upload_save not found");
  return tool;
}

function context(): ToolContext {
  return {
    interfaceType: "test",
    userId: "user-1",
    conversationId: "conv-1",
    channelId: "conv-1",
    userPermissionLevel: "trusted",
  };
}

describe("system_upload_save tool", () => {
  it("requires confirmation before dispatching to the registered media handler", async () => {
    const calls: unknown[] = [];
    const services = buildServices({
      uploadHandler: async (input) => {
        calls.push(input);
        return {
          success: true,
          data: { entityId: "report", status: "created" },
        };
      },
    });
    const tool = getUploadSaveTool(createSystemTools(services));

    const pending = await tool.handler(
      { upload: { kind: "upload", id: uploadId }, title: "Quarterly Report" },
      context(),
    );

    expect(pending).toMatchObject({
      needsConfirmation: true,
      toolName: "system_upload_save",
      summary: 'Save uploaded file as "Quarterly Report"?',
    });
    expect(calls).toEqual([]);

    const confirmed = await tool.handler(
      (pending as { args: Record<string, unknown> }).args,
      context(),
    );

    expect(confirmed).toMatchObject({
      success: true,
      data: { entityId: "report", status: "created" },
    });
    expect(calls).toEqual([
      { upload: { kind: "upload", id: uploadId }, title: "Quarterly Report" },
    ]);
  });

  it("rejects accessible uploads when no plugin registered a media handler", async () => {
    const services = buildServices({ mediaType: "application/zip" });
    const tool = getUploadSaveTool(createSystemTools(services));

    const result = await tool.handler(
      { upload: { kind: "upload", id: uploadId } },
      context(),
    );

    expect(result).toMatchObject({
      success: false,
      error:
        'No installed plugin can save uploads with media type "application/zip".',
    });
  });
});
