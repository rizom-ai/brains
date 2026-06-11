import type {
  InterfacePluginContext,
  StructuredChatCard,
} from "@brains/plugins";
import { z } from "@brains/utils";
import { stripInternalEntityMemoryNote } from "./display-content";

const storedChatAttachmentSchema = z.object({
  kind: z.literal("text"),
  filename: z.string().min(1),
  mediaType: z.string().min(1),
  sizeBytes: z.number().nonnegative().optional(),
  source: z
    .object({
      kind: z.string().min(1),
      id: z.string().min(1),
    })
    .optional(),
});

const storedChatAttachmentsSchema = z.array(storedChatAttachmentSchema);

const storedAttachmentCardSchema = z.object({
  kind: z.literal("attachment"),
  id: z.string().min(1),
  jobId: z.string().min(1).optional(),
  title: z.string().min(1),
  description: z.string().optional(),
  attachment: z.object({
    mediaType: z.string().min(1),
    url: z.string().min(1),
    downloadUrl: z.string().min(1).optional(),
    previewUrl: z.string().min(1).optional(),
    filename: z.string().min(1).optional(),
    sizeBytes: z.number().nonnegative().optional(),
    source: z
      .object({
        entityType: z.string().optional(),
        entityId: z.string().optional(),
        attachmentType: z.string().optional(),
      })
      .optional(),
  }),
});

const storedSourcesCardSchema = z.object({
  kind: z.literal("sources"),
  id: z.string().min(1),
  title: z.string().min(1).optional(),
  sources: z
    .array(
      z.object({
        id: z.string().min(1),
        title: z.string().min(1).optional(),
        source: z.string().min(1),
        url: z.string().min(1).optional(),
        entityType: z.string().min(1).optional(),
        entityId: z.string().min(1).optional(),
        excerpt: z.string().min(1).optional(),
        provenance: z.record(z.unknown()).optional(),
      }),
    )
    .min(1),
});

const storedActionsCardSchema = z.object({
  kind: z.literal("actions"),
  id: z.string().min(1),
  title: z.string().min(1).optional(),
  defaultOpen: z.boolean().optional(),
  actions: z
    .array(
      z.discriminatedUnion("type", [
        z.object({
          type: z.literal("prompt"),
          id: z.string().min(1),
          label: z.string().min(1),
          prompt: z.string().min(1),
          description: z.string().min(1).optional(),
        }),
        z.object({
          type: z.literal("event"),
          id: z.string().min(1),
          label: z.string().min(1),
          event: z.string().min(1),
          description: z.string().min(1).optional(),
        }),
      ]),
    )
    .min(1),
});

const storedChatCardsSchema = z.array(
  z.discriminatedUnion("kind", [
    storedAttachmentCardSchema,
    storedSourcesCardSchema,
    storedActionsCardSchema,
  ]),
);

type PermissionResolver = (request: Request) => Promise<"anchor" | "public">;
type ConversationService = InterfacePluginContext["conversations"];

interface MessageHandlerDeps {
  conversations: ConversationService;
  resolvePermissionLevel: PermissionResolver;
  interfaceType: string;
}

export async function handleMessagesRequest(
  request: Request,
  deps: MessageHandlerDeps,
): Promise<Response> {
  const permissionLevel = await deps.resolvePermissionLevel(request);
  if (permissionLevel !== "anchor") {
    return new Response("Forbidden", { status: 403 });
  }

  const conversationId = new URL(request.url).searchParams.get("id");
  if (!conversationId) {
    return new Response("Missing conversation id", { status: 400 });
  }

  const conversation = await deps.conversations.get(conversationId);
  if (conversation?.interfaceType !== deps.interfaceType) {
    return new Response("Conversation not found", { status: 404 });
  }

  const messages = await deps.conversations.getMessages(conversationId, {
    limit: 100,
  });

  return Response.json({
    messages: messages.map((message) => {
      const attachments = getStoredMessageAttachments(
        message.metadata,
        message.timestamp,
      );
      const cards = getStoredMessageCards(message.metadata);
      return {
        id: message.id,
        role: message.role,
        content: stripInternalEntityMemoryNote(message.content),
        ...(attachments.length > 0 ? { attachments } : {}),
        ...(cards.length > 0 ? { cards } : {}),
      };
    }),
  });
}

function getStoredMessageAttachments(
  metadata: unknown,
  createdAt: string,
): Array<{
  kind: "text";
  filename: string;
  mediaType: string;
  sizeBytes: number;
  createdAt: string;
  source?: { kind: string; id: string } | undefined;
}> {
  const parsedMetadata = parseStoredMessageMetadata(metadata);
  const parsedAttachments = storedChatAttachmentsSchema.safeParse(
    parsedMetadata?.["attachments"],
  );
  if (!parsedAttachments.success) return [];

  return parsedAttachments.data.map((attachment) => ({
    kind: attachment.kind,
    filename: attachment.filename,
    mediaType: attachment.mediaType,
    sizeBytes: attachment.sizeBytes ?? 0,
    createdAt,
    ...(attachment.source !== undefined && { source: attachment.source }),
  }));
}

function getStoredMessageCards(metadata: unknown): StructuredChatCard[] {
  const parsedMetadata = parseStoredMessageMetadata(metadata);
  const parsedCards = storedChatCardsSchema.safeParse(
    parsedMetadata?.["cards"],
  );
  if (!parsedCards.success) return [];
  return parsedCards.data;
}

export function parseStoredMessageMetadata(
  metadata: unknown,
): Record<string, unknown> | null {
  if (typeof metadata === "string") {
    try {
      const parsed = JSON.parse(metadata) as unknown;
      return isRecord(parsed) ? parsed : null;
    } catch {
      return null;
    }
  }
  return isRecord(metadata) ? metadata : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
