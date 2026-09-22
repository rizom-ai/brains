import {
  getMessageUploadKind,
  isMessageUploadDeclaredSizeAllowed,
  normalizeMessageUploadMediaType,
  sanitizeUploadFilename,
  captureRuntimeUpload,
  AcknowledgedRuntimeUploadError,
  RetainedUploadBatchError,
  messageTextUploadMaxBytes,
  messageUploadMaxBytes,
  type ChatAttachment,
  type InterfacePluginContext,
  type RuntimeUploadRecord,
} from "@brains/plugins";
import { validateMessageUploadFacts } from "@brains/plugins/message-interface/upload-policy";
import { uploadInspectionDetailsSchema } from "@brains/plugins/message-interface/upload-inspection";
import type { Message as SdkMessage } from "chat";
import type { JsonObject } from "@brains/contracts";
import type { ChatThread, ChatUploadStore } from "./types";

interface Message extends Pick<
  SdkMessage,
  "id" | "text" | "author" | "isMention"
> {
  attachments: Pick<
    SdkMessage["attachments"][number],
    "name" | "mimeType" | "size" | "url" | "fetchMetadata"
  >[];
}

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
export type ChatFetch = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;
interface ChatInputBuilderDeps {
  getUploadStore(platform: string): ChatUploadStore | undefined;
  getFileTransfers(): InterfacePluginContext["fileTransfers"];
  getDownloadSource(
    platform: string,
    attachment: Message["attachments"][number],
  ): { url: string; authorization?: string };
  getThreadIdParts(threadId: string): ThreadIdParts;
  logger: { error(message: string, context?: Record<string, unknown>): void };
}
class RejectedUpload extends Error {}

/** Capture and inspect inside admitted native loans. SDK fetchData and controller
 * materialization are deliberately not alternate download paths. */
export class ChatInputBuilder {
  private readonly deps: ChatInputBuilderDeps;
  private lifetime = new AbortController();
  private readonly pending = new Set<
    Promise<AgentInput & { signal: AbortSignal }>
  >();

  get signal(): AbortSignal {
    return this.lifetime.signal;
  }

  start(): void {
    if (this.pending.size) throw new Error("Chat inputs have not retired");
    if (this.lifetime.signal.aborted) this.lifetime = new AbortController();
  }

  async stop(): Promise<void> {
    this.lifetime.abort(new Error("Chat input stopped"));
    await Promise.allSettled([...this.pending]);
  }

  constructor(deps: ChatInputBuilderDeps) {
    this.deps = deps;
  }

  build(
    platform: string,
    thread: Pick<ChatThread, "id" | "channelId">,
    message: Message,
    userLevel: string,
    borrowedSignal?: AbortSignal,
  ): Promise<AgentInput & { signal: AbortSignal }> {
    const signal = borrowedSignal
      ? AbortSignal.any([this.lifetime.signal, borrowedSignal])
      : this.lifetime.signal;
    signal.throwIfAborted();
    const retained: RuntimeUploadRecord[] = [];
    const task = this.buildInput(
      platform,
      thread,
      message,
      userLevel,
      signal,
      retained,
    )
      .catch((error: unknown) => {
        if (retained.length)
          throw new RetainedUploadBatchError(retained, error);
        throw error;
      })
      .finally(() => this.pending.delete(task));
    this.pending.add(task);
    return task;
  }

  private async buildInput(
    platform: string,
    thread: Pick<ChatThread, "id" | "channelId">,
    message: Message,
    userLevel: string,
    signal: AbortSignal,
    retained: RuntimeUploadRecord[],
  ): Promise<AgentInput & { signal: AbortSignal }> {
    signal.throwIfAborted();
    const agentInput: AgentInput & { signal: AbortSignal } = {
      signal,
      message: normalizeIncomingMessageText(platform, message),
      attachments: [],
      notices: [],
    };
    if (
      !message.attachments.length ||
      (userLevel !== "admin" && userLevel !== "trusted")
    )
      return agentInput;
    const uploadStore = this.deps.getUploadStore(platform);
    if (!uploadStore) return agentInput;
    for (const attachment of message.attachments) {
      signal.throwIfAborted();
      if (!attachment.name) continue;
      const filename = sanitizeUploadFilename(attachment.name, "upload");
      const mediaType = normalizeMessageUploadMediaType(
        filename,
        attachment.mimeType,
      );
      const kind = getMessageUploadKind(filename, mediaType);
      if (!kind) {
        agentInput.notices.push(`Unsupported file upload type: ${filename}`);
        continue;
      }
      if (!isMessageUploadDeclaredSizeAllowed(kind, attachment.size ?? 0)) {
        agentInput.notices.push(`File upload too large: ${filename}`);
        continue;
      }
      try {
        const files = this.deps.getFileTransfers();
        if (!files) throw new Error("Chat upload capture is not provisioned");
        const record = await captureRuntimeUpload(
          {
            filename,
            mediaType,
            metadata: this.buildMetadata(platform, thread, message),
            source: {
              ...this.deps.getDownloadSource(platform, attachment),
              maxBytes:
                kind === "text"
                  ? messageTextUploadMaxBytes
                  : messageUploadMaxBytes,
            },
          },
          files,
          uploadStore,
          {
            signal,
            validateFile: async (file, signal) => {
              signal.throwIfAborted();
              if (
                platform === "slack" &&
                file.details.mediaType === "text/html"
              )
                throw new RejectedUpload(
                  "Slack returned an HTML login page; check the files:read scope",
                );
              const inspection = await files.inspect(
                { sourceFile: file.sourceFile, sizeBytes: file.sizeBytes },
                { inspector: "message-upload", signal },
              );
              signal.throwIfAborted();
              if (
                inspection.sizeBytes !== file.sizeBytes ||
                inspection.sha256 !== file.sha256
              )
                throw new Error(
                  "Captured chat upload changed before inspection",
                );
              const details = uploadInspectionDetailsSchema.parse(
                inspection.details,
              );
              const validation = validateMessageUploadFacts({
                filename,
                mediaType,
                sizeBytes: inspection.sizeBytes,
                ...details,
              });
              if (!validation.ok) throw new RejectedUpload(validation.message);
            },
          },
        );
        retained.push(record);
        agentInput.attachments.push(chatAttachmentFromStoredUpload(record));
      } catch (error) {
        // Acknowledged retention followed by failed retirement must not start a
        // model turn or silently replay the upload. Keep the record on the error.
        if (error instanceof AcknowledgedRuntimeUploadError) throw error;
        if (error instanceof RejectedUpload) {
          agentInput.notices.push(error.message);
          continue;
        }
        const failures: unknown[] = [error];
        try {
          this.deps.logger.error("Failed to capture chat attachment", {
            error,
            filename,
          });
        } catch (reporting) {
          if (!failures.includes(reporting)) failures.push(reporting);
        }
        if (failures.length > 1)
          throw new AggregateError(
            failures,
            "Chat upload capture and reporting failed",
            { cause: error },
          );
        throw error;
      }
    }
    signal.throwIfAborted();
    return agentInput;
  }

  private buildMetadata(
    platform: string,
    thread: Pick<ChatThread, "id" | "channelId">,
    message: Message,
  ): JsonObject {
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

export function chatAttachmentFromStoredUpload(
  record: RuntimeUploadRecord,
): ChatAttachment {
  return {
    kind: "file",
    filename: record.filename,
    mediaType: record.mediaType,
    sizeBytes: record.sizeBytes,
    source: record.ref,
  };
}

function normalizeIncomingMessageText(
  platform: string,
  message: Message,
): string {
  const text = message.text.trim();
  if (platform !== "slack" || !message.isMention) return text;
  return text.replace(/(^|\s)@[UW][A-Z0-9]+\b\s*/g, "$1").trim();
}
