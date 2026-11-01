import type { IConversationService } from "@brains/conversation-service";
import type { CreateInput, EntityTypeConfig } from "@brains/entity-service";
import type { Tool, ToolContext } from "@brains/mcp-service";
import type {
  IRuntimeUploadsNamespace,
  ResolvedRuntimeUpload,
  RuntimeUploadRecord,
  ScopedRuntimeUploadStore,
} from "@brains/plugins";
import { createSystemTools } from "../../src/system/tools";
import { createMockSystemServices } from "./mock-services";

export interface FixtureUpload {
  id: string;
  filename: string;
  mediaType: string;
  content: string;
}

export const conversationId = "conv-uploads";

/** A conversation whose one user message carries every upload. */
function conversationWithUploads(
  uploads: FixtureUpload[],
): IConversationService {
  return {
    startConversation: async () => conversationId,
    addMessage: async () => undefined,
    getMessages: async () => [
      {
        id: "message-1",
        conversationId,
        role: "user",
        content: "keep these",
        timestamp: new Date(0).toISOString(),
        metadata: JSON.stringify({
          attachments: uploads.map((upload) => ({
            kind: "file",
            filename: upload.filename,
            mediaType: upload.mediaType,
            source: { kind: "upload", id: upload.id },
          })),
        }),
      },
    ],
    countMessages: async () => 1,
    getConversation: async () => null,
    listConversations: async () => [],
    updateConversationMetadata: async () => false,
    deleteConversation: async () => false,
    deleteExpiredGuestConversations: async () => 0,
    searchConversations: async () => [],
    close: () => undefined,
  };
}

function uploadsStore(uploads: FixtureUpload[]): IRuntimeUploadsNamespace {
  const unexpected = (name: string) => (): never => {
    throw new Error(`${name} was not expected in this test`);
  };
  const record = (id: string): RuntimeUploadRecord => {
    const upload = uploads.find((candidate) => candidate.id === id);
    if (!upload) throw new Error("Upload ref not found");
    return {
      id,
      ref: { kind: "upload", id },
      filename: upload.filename,
      mediaType: upload.mediaType,
      sizeBytes: upload.content.length,
      createdAt: new Date(0).toISOString(),
    };
  };
  return {
    scoped: (): ScopedRuntimeUploadStore => ({
      readRecord: async (id) => record(id),
      read: async (id): Promise<ResolvedRuntimeUpload> => {
        const found = record(id);
        const upload = uploads.find((candidate) => candidate.id === id);
        return {
          record: found,
          content: Buffer.from(upload?.content ?? "", "utf8"),
        };
      },
      save: unexpected("save"),
      toResponseBody: unexpected("toResponseBody"),
      prune: unexpected("prune"),
      getUploadDir: unexpected("getUploadDir"),
      remove: unexpected("remove"),
    }),
  };
}

export interface UploadFixture {
  services: ReturnType<typeof createMockSystemServices>;
  tool: Tool;
  /** What each plugin was asked to save, in order. */
  noteImports: CreateInput[];
  preserved: Array<{ upload: { id: string }; title?: string }>;
}

/**
 * Services with the uploads in one conversation, a note type that imports
 * Markdown, and an image type that keeps uploaded images.
 */
export function uploadFixture(uploads: FixtureUpload[]): UploadFixture {
  const services = createMockSystemServices({
    conversationService: conversationWithUploads(uploads),
    runtimeUploads: uploadsStore(uploads),
  });
  services.registerEntityTypes(["note", "image", "document"]);
  const markdownImportTypes = new Set(["note"]);
  services.entityRegistry.getEntityTypeConfig = (
    type: string,
  ): EntityTypeConfig => ({ markdownImport: markdownImportTypes.has(type) });
  const noteImports: CreateInput[] = [];
  const preserved: UploadFixture["preserved"] = [];
  services.entityRegistry.registerCreateInterceptor("note", async (input) => {
    noteImports.push(input);
    const entityId = input.title?.toLowerCase().replace(/\s+/g, "-") ?? "note";
    return {
      kind: "handled",
      result: {
        success: true,
        data: { entityId, status: "generating", jobId: `job-${entityId}` },
      },
    };
  });
  services.entityRegistry.registerUploadSaveHandler({
    entityType: "image",
    mediaTypes: ["image/png"],
    handler: async (input) => {
      preserved.push({
        upload: { id: input.upload.id },
        ...(input.title !== undefined ? { title: input.title } : {}),
      });
      const entityId = input.title ?? "image";
      return {
        success: true,
        data: { entityId, status: "generating", jobId: `job-${entityId}` },
      };
    },
  });
  const tool = createSystemTools(services).find(
    (candidate) => candidate.name === "system_create",
  );
  if (!tool) throw new Error("system_create not found");
  return { services, tool, noteImports, preserved };
}

export function uploadContext(): ToolContext {
  return {
    interfaceType: "web-chat",
    actor: { kind: "user", userId: "user-1" },
    conversationId,
    channelId: conversationId,
    userPermissionLevel: "admin",
  };
}
