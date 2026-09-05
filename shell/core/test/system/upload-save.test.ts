import {
  expectConfirmationArgs,
  expectToolConfirmation,
  expectToolError,
} from "@brains/mcp-service/test";
import { describe, expect, it } from "bun:test";
import type { IConversationService } from "@brains/conversation-service";
import type { Tool, ToolContext } from "@brains/mcp-service";
import type { UploadSaveHandler } from "@brains/entity-service";
import type {
  IRuntimeUploadsNamespace,
  RuntimeUploadRecord,
  ScopedRuntimeUploadStore,
} from "@brains/plugins";
import { createSystemTools } from "../../src/system/tools";
import { createInputSchema } from "../../src/system/schemas";
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
  entityType?: string;
  uploadHandler?: UploadSaveHandler;
}): ReturnType<typeof createMockSystemServices> {
  const mediaType = input.mediaType ?? "application/pdf";
  // The whole scoped store surface. Only readRecord is exercised here; the
  // rest throw so an unexpected call names itself rather than returning
  // undefined. Before, scoped() returned the RuntimeUploadStore class, so this
  // stub had to be asserted past fourteen members including private fields.
  const unexpected = (name: string) => (): never => {
    throw new Error(name + " was not expected in this test");
  };
  const runtimeUploads: IRuntimeUploadsNamespace = {
    scoped: (): ScopedRuntimeUploadStore => ({
      readRecord: async (): Promise<RuntimeUploadRecord> => ({
        id: uploadId,
        ref: { kind: "upload", id: uploadId },
        filename: "report.pdf",
        mediaType,
        sizeBytes: 12,
        createdAt: new Date(0).toISOString(),
      }),
      save: unexpected("save"),
      read: unexpected("read"),
      toResponseBody: unexpected("toResponseBody"),
      prune: unexpected("prune"),
      getUploadDir: unexpected("getUploadDir"),
      remove: unexpected("remove"),
    }),
  };

  const services = createMockSystemServices({
    conversationService: conversationWithUpload(),
    runtimeUploads,
  });
  services.registerEntityTypes(["note", "document", "image"]);
  if (input.uploadHandler) {
    services.entityRegistry.registerUploadSaveHandler({
      entityType: input.entityType ?? "document",
      mediaTypes: [mediaType],
      handler: input.uploadHandler,
    });
  }
  return services;
}

function getCreateTool(tools: Tool[]): Tool {
  const tool = tools.find((candidate) => candidate.name === "system_create");
  if (!tool) throw new Error("system_create not found");
  return tool;
}

function context(): ToolContext {
  return {
    interfaceType: "test",
    actor: { kind: "user", userId: "user-1" },
    conversationId: "conv-1",
    channelId: "conv-1",
    userPermissionLevel: "trusted",
  };
}

describe("system_create upload preserve", () => {
  it("exposes preserve as an upload transform and removes system_upload_save", () => {
    expect(
      createInputSchema.safeParse({
        entityType: "document",
        source: {
          kind: "upload",
          upload: { kind: "upload", id: uploadId },
          transform: "preserve",
        },
      }).success,
    ).toBe(true);

    const toolNames = createSystemTools(buildServices({})).map(
      (tool) => tool.name,
    );
    expect(toolNames).toContain("system_create");
    expect(toolNames).not.toContain("system_upload_save");
  });

  it("preserves explicit visibility through confirmation and media dispatch", async () => {
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
    const tool = getCreateTool(createSystemTools(services));

    const pending = await tool.handler(
      {
        entityType: "document",
        title: "Quarterly Report",
        visibility: "shared",
        source: {
          kind: "upload",
          upload: { kind: "upload", id: uploadId },
          transform: "preserve",
        },
      },
      context(),
    );

    // Parsed before the assertions: `toMatchObject` replaces matched fields on
    // the received object with the matcher itself, so anything read from
    // `pending` afterwards is the matcher rather than the value.
    const confirmation = expectToolConfirmation(pending);
    const confirmationArgs = expectConfirmationArgs(pending);

    expect(confirmation).toMatchObject({
      needsConfirmation: true,
      toolName: "system_create",
      summary: 'Save uploaded file as "Quarterly Report"?',
      preview: expect.stringContaining("Visibility: shared"),
    });
    expect(confirmationArgs).toMatchObject({
      visibility: "shared",
      source: { transform: "preserve" },
    });
    expect(calls).toEqual([]);

    const confirmed = await tool.handler(confirmationArgs, context());

    expect(confirmed).toMatchObject({
      success: true,
      data: { entityId: "report", status: "created" },
    });
    expect(calls).toEqual([
      {
        upload: { kind: "upload", id: uploadId },
        title: "Quarterly Report",
        visibility: "shared",
      },
    ]);
  });

  it("derives preserved upload entity type from media handler instead of trusting model entityType", async () => {
    const calls: unknown[] = [];
    const services = buildServices({
      entityType: "document",
      uploadHandler: async (input) => {
        calls.push(input);
        return {
          success: true,
          data: { entityId: "report", status: "created" },
        };
      },
    });
    const tool = getCreateTool(createSystemTools(services));

    const pending = await tool.handler(
      {
        entityType: "image",
        title: "Quarterly Report",
        source: {
          kind: "upload",
          upload: { kind: "upload", id: uploadId },
          transform: "preserve",
        },
      },
      context(),
    );

    const confirmation = expectToolConfirmation(pending);
    const confirmationArgs = expectConfirmationArgs(pending);

    expect(confirmation).toMatchObject({
      needsConfirmation: true,
      toolName: "system_create",
    });
    expect(confirmationArgs).toMatchObject({ entityType: "document" });
    expect(confirmation.preview).toContain("Entity type: document");

    const confirmed = await tool.handler(confirmationArgs, context());

    expect(confirmed).toMatchObject({ success: true });
    expect(calls).toEqual([
      { upload: { kind: "upload", id: uploadId }, title: "Quarterly Report" },
    ]);
  });

  it("rejects confirmed preserve calls whose args do not match the pending approval", async () => {
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
    const tool = getCreateTool(createSystemTools(services));

    const pending = await tool.handler(
      {
        entityType: "document",
        title: "Quarterly Report",
        source: {
          kind: "upload",
          upload: { kind: "upload", id: uploadId },
          transform: "preserve",
        },
      },
      context(),
    );
    const args = expectConfirmationArgs(pending);

    const swapped = await tool.handler(
      { ...args, title: "Different Title" },
      context(),
    );

    expect(swapped).toMatchObject({ success: false });
    expect(expectToolError(swapped).error).toContain(
      "do not match the pending approval",
    );
    expect(calls).toEqual([]);
  });

  it("rejects accessible preserve uploads when no plugin registered a media handler", async () => {
    const services = buildServices({ mediaType: "application/zip" });
    const tool = getCreateTool(createSystemTools(services));

    const result = await tool.handler(
      {
        entityType: "document",
        source: {
          kind: "upload",
          upload: { kind: "upload", id: uploadId },
          transform: "preserve",
        },
      },
      context(),
    );

    expect(result).toMatchObject({
      success: false,
      error:
        'No installed plugin can save uploads with media type "application/zip".',
    });
  });
});
