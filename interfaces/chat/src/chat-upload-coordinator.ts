import {
  MessageUploadContinuity,
  type ChatAttachment,
  type ScopedRuntimeUploadStore,
} from "@brains/sdk/internal/interface-runtime";
import type { ChatHost } from "./chat-host";
import {
  chatAttachmentFromStoredUpload,
  type AgentInput,
} from "./chat-input-builder";
import type { ChatPlatform } from "./types";
import { canonicalChatUploadRefKind } from "./upload-store";

interface ChatUploadCoordinatorDeps {
  host: ChatHost;
  logger: {
    debug: (message: string, context?: Record<string, unknown>) => void;
  };
}

/**
 * Owns the upload store and cross-turn upload continuity for every Chat SDK
 * platform: uploads are kept in, and prior uploads restored from, the
 * runtime's shared upload store.
 */
export class ChatUploadCoordinator {
  private readonly deps: ChatUploadCoordinatorDeps;
  private readonly continuity: Readonly<
    Record<ChatPlatform, MessageUploadContinuity>
  >;

  constructor(deps: ChatUploadCoordinatorDeps) {
    this.deps = deps;
    this.continuity = {
      discord: this.createContinuity("discord"),
      slack: this.createContinuity("slack"),
    };
  }

  clear(): void {
    this.continuity.discord.clear();
    this.continuity.slack.clear();
  }

  getCanonicalStore(): ScopedRuntimeUploadStore {
    return this.deps.host.sharedUploads();
  }

  async selectPriorUploads(input: {
    platform: ChatPlatform;
    conversationId: string;
    currentAttachments: ChatAttachment[];
    canRestore: boolean;
  }): Promise<ChatAttachment[]> {
    return this.continuity[input.platform].selectPriorUploads({
      conversationId: input.conversationId,
      currentAttachments: input.currentAttachments,
      canRestore: input.canRestore,
    });
  }

  async attachPriorUploads(
    platform: ChatPlatform,
    conversationId: string,
    agentInput: AgentInput,
    userLevel: string,
  ): Promise<void> {
    agentInput.attachments = await this.selectPriorUploads({
      platform,
      conversationId,
      currentAttachments: agentInput.attachments,
      canRestore: userLevel === "admin" || userLevel === "trusted",
    });
  }

  remember(
    platform: ChatPlatform,
    conversationId: string,
    attachments: ChatAttachment[],
  ): void {
    this.continuity[platform].remember(conversationId, attachments);
  }

  private createContinuity(platform: ChatPlatform): MessageUploadContinuity {
    return new MessageUploadContinuity({
      sourceKind: canonicalChatUploadRefKind,
      loadMessages: async (conversationId): Promise<readonly unknown[]> => {
        return this.deps.host.conversations.getMessages(conversationId, {
          limit: 50,
        });
      },
      restoreAttachment: async (uploadId): Promise<ChatAttachment> => {
        const uploadStore = this.getCanonicalStore();
        const resolved = await uploadStore.read(uploadId);
        return chatAttachmentFromStoredUpload(
          resolved.record.filename,
          resolved.record.mediaType,
          resolved.content,
          resolved.record.ref,
        );
      },
      onLoadError: (error, conversationId): void => {
        this.deps.logger.debug("Failed to load prior chat uploads", {
          error,
          conversationId,
          platform,
        });
      },
      onRestoreError: (error, uploadId): void => {
        this.deps.logger.debug("Failed to restore prior chat upload", {
          error,
          uploadId,
          platform,
        });
      },
    });
  }
}
