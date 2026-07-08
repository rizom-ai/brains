import {
  getMessageUploadKind,
  isMessageUploadDeclaredSizeAllowed,
  isUploadableTextFile,
  normalizeMessageUploadMediaType,
  sanitizeUploadFilename,
  validateMessageUpload,
  type ChatAttachment,
  type RuntimeUploadStore,
} from "@brains/plugins";
import type { Message } from "chat";
import type { ChatThread } from "./types";

export interface AgentInput {
  message: string;
  attachments: ChatAttachment[];
  notices: string[];
}

interface ThreadIdParts {
  guildId?: string;
  channelId?: string;
  threadId?: string;
}

interface ChatInputBuilderDeps {
  /** The platform's already-scoped upload store (Discord scope applied by the caller). */
  getUploadStore: () => RuntimeUploadStore | undefined;
  getThreadIdParts: (threadId: string) => ThreadIdParts;
  logger: {
    error: (message: string, context?: Record<string, unknown>) => void;
  };
}

/**
 * Turns an incoming chat message into agent input: validates and stores each
 * file attachment (collecting notices for rejects), producing the message text
 * plus ChatAttachments. Platform-agnostic — the only platform-specific input,
 * the scoped upload store, is injected so a future Slack adapter reuses this.
 */
export class ChatInputBuilder {
  private readonly deps: ChatInputBuilderDeps;

  constructor(deps: ChatInputBuilderDeps) {
    this.deps = deps;
  }

  async build(
    platform: string,
    thread: ChatThread,
    message: Message,
    userLevel: string,
  ): Promise<AgentInput> {
    const agentInput: AgentInput = {
      message: message.text.trim(),
      attachments: [],
      notices: [],
    };
    if (message.attachments.length === 0) return agentInput;

    const canUpload = userLevel === "anchor" || userLevel === "trusted";
    if (!canUpload) return agentInput;

    const uploadStore = this.deps.getUploadStore();
    if (!uploadStore) return agentInput;

    for (const attachment of message.attachments) {
      const attachmentName = attachment.name;
      if (!attachmentName) continue;
      const filename = sanitizeUploadFilename(attachmentName, "upload");
      const mediaType = normalizeMessageUploadMediaType(
        filename,
        attachment.mimeType,
      );
      const declaredSize = attachment.size ?? 0;
      const uploadKind = getMessageUploadKind(filename, mediaType);
      if (!uploadKind) {
        agentInput.notices.push(`Unsupported file upload type: ${filename}`);
        continue;
      }
      if (!isMessageUploadDeclaredSizeAllowed(uploadKind, declaredSize)) {
        agentInput.notices.push(`File upload too large: ${filename}`);
        continue;
      }

      try {
        const content = await this.readAttachmentData(attachment);
        if (!content) continue;
        const validation = validateMessageUpload({
          filename,
          mediaType,
          content,
          fallbackFilename: "upload",
        });
        if (!validation.ok) {
          agentInput.notices.push(validation.message);
          continue;
        }
        const record = await uploadStore.save({
          filename: validation.filename,
          mediaType: validation.mediaType,
          content,
          metadata: this.buildMetadata(platform, thread, message),
        });
        agentInput.attachments.push(
          toChatAttachment(
            record.filename,
            record.mediaType,
            content,
            record.ref,
            validation.kind === "text",
          ),
        );
      } catch (error: unknown) {
        this.deps.logger.error("Failed to read chat attachment", {
          error,
          filename,
        });
        agentInput.notices.push(`Could not read file upload: ${filename}`);
      }
    }

    return agentInput;
  }

  private async readAttachmentData(
    attachment: Message["attachments"][number],
  ): Promise<Buffer | undefined> {
    if (attachment.fetchData) return attachment.fetchData();
    if (!attachment.url) return undefined;

    const response = await fetch(attachment.url);
    if (!response.ok) {
      throw new Error(
        `Attachment download failed with status ${response.status}`,
      );
    }
    const data = await response.arrayBuffer();
    return Buffer.from(new Uint8Array(data));
  }

  private buildMetadata(
    platform: string,
    thread: ChatThread,
    message: Message,
  ): Record<string, unknown> {
    const ids = this.deps.getThreadIdParts(thread.id);
    return {
      interfaceType: platform,
      channelId: thread.id,
      parentChannelId: thread.channelId,
      messageId: message.id,
      uploaderId: message.author.userId,
      uploaderUsername: message.author.userName,
      ...(ids.guildId ? { guildId: ids.guildId } : {}),
      ...(ids.threadId ? { threadId: ids.threadId } : {}),
    };
  }
}

/** Build a ChatAttachment from already-stored upload bytes (no re-save). */
export function chatAttachmentFromStoredUpload(
  filename: string,
  mediaType: string,
  content: Buffer,
  source: { kind: string; id: string },
): ChatAttachment {
  return toChatAttachment(
    filename,
    mediaType,
    content,
    source,
    isUploadableTextFile(filename, mediaType),
  );
}

function toChatAttachment(
  filename: string,
  mediaType: string,
  content: Buffer,
  source: { kind: string; id: string },
  isText: boolean,
): ChatAttachment {
  if (isText) {
    return {
      kind: "text",
      filename,
      mediaType,
      content: content.toString("utf8").replace(/^\uFEFF/, ""),
      sizeBytes: content.byteLength,
      source,
    };
  }
  return {
    kind: "file",
    filename,
    mediaType,
    data: content,
    sizeBytes: content.byteLength,
    source,
  };
}
