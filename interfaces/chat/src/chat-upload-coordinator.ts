import {
  MessageUploadContinuity,
  type ChatAttachment,
  type ScopedRuntimeUploadStore,
} from "@brains/sdk/interfaces";
import type { Logger } from "@brains/utils/logger";
import {
  chatAttachmentFromStoredUpload,
  type AgentInput,
} from "./chat-input-builder";
import type { ChatPlatform } from "./types";
import {
  canonicalChatUploadRefKind,
  discordChatUploadRefKind,
  slackChatUploadRefKind,
} from "./upload-store";

interface ChatUploadCoordinatorDeps {
  platform: ChatPlatform;
  /** Where uploads are kept and referenced from, for every platform alike. */
  canonical: ScopedRuntimeUploadStore;
  /** Where this platform's adapter served uploads from before they were canonical. */
  platformStore: ScopedRuntimeUploadStore;
  loadMessages: (conversationId: string) => Promise<readonly unknown[]>;
  logger: Logger;
}

/**
 * Cross-turn upload continuity for one platform.
 *
 * A follow-up that says "the first one" means an upload from an earlier
 * turn; the conversation's stored messages say which. Uploads referenced
 * under the platform's old store are migrated to the canonical one the first
 * time they are restored.
 */
export class ChatUploadCoordinator {
  readonly canonical: ScopedRuntimeUploadStore;
  readonly platformStore: ScopedRuntimeUploadStore;
  private readonly continuity: MessageUploadContinuity;

  constructor(deps: ChatUploadCoordinatorDeps) {
    this.canonical = deps.canonical;
    this.platformStore = deps.platformStore;
    this.continuity = new MessageUploadContinuity({
      sourceKind: canonicalChatUploadRefKind,
      legacySourceKinds: [
        deps.platform === "discord"
          ? discordChatUploadRefKind
          : slackChatUploadRefKind,
      ],
      loadMessages: deps.loadMessages,
      restoreAttachment: async (
        uploadId,
        sourceKind,
      ): Promise<ChatAttachment> => {
        const fromCanonical = sourceKind === canonicalChatUploadRefKind;
        const resolved = await (
          fromCanonical ? this.canonical : this.platformStore
        ).read(uploadId);
        if (fromCanonical) {
          return chatAttachmentFromStoredUpload(
            resolved.record.filename,
            resolved.record.mediaType,
            resolved.content,
            resolved.record.ref,
          );
        }
        const canonical = await this.canonical.save({
          filename: resolved.record.filename,
          mediaType: resolved.record.mediaType,
          content: resolved.content,
          ...(resolved.record.metadata
            ? { metadata: resolved.record.metadata }
            : {}),
        });
        return chatAttachmentFromStoredUpload(
          canonical.filename,
          canonical.mediaType,
          resolved.content,
          canonical.ref,
        );
      },
      onLoadError: (error, conversationId): void => {
        deps.logger.debug("Failed to load prior chat uploads", {
          error,
          conversationId,
          platform: deps.platform,
        });
      },
      onRestoreError: (error, uploadId): void => {
        deps.logger.debug("Failed to restore prior chat upload", {
          error,
          uploadId,
          platform: deps.platform,
        });
      },
    });
  }

  clear(): void {
    this.continuity.clear();
  }

  selectPriorUploads(input: {
    conversationId: string;
    currentAttachments: ChatAttachment[];
    canRestore: boolean;
  }): Promise<ChatAttachment[]> {
    return this.continuity.selectPriorUploads(input);
  }

  async attachPriorUploads(
    conversationId: string,
    agentInput: AgentInput,
    userLevel: string,
  ): Promise<void> {
    agentInput.attachments = await this.selectPriorUploads({
      conversationId,
      currentAttachments: agentInput.attachments,
      canRestore: userLevel === "admin" || userLevel === "trusted",
    });
  }

  remember(conversationId: string, attachments: ChatAttachment[]): void {
    this.continuity.remember(conversationId, attachments);
  }
}
