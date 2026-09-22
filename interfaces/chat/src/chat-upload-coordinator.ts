import {
  MessageUploadContinuity,
  type ChatAttachment,
  type InterfacePluginContext,
  type ScopedRuntimeUploadStore,
} from "@brains/plugins";
import {
  chatAttachmentFromStoredUpload,
  type AgentInput,
} from "./chat-input-builder";
import type { ChatPlatform } from "./types";
import {
  canonicalChatUploadRefKind,
  createCanonicalChatUploadStoreScope,
} from "./upload-store";

interface ChatUploadCoordinatorDeps {
  getContext: () => InterfacePluginContext | undefined;
  logger: {
    debug: (message: string, context?: Record<string, unknown>) => void;
  };
}

/**
 * Owns upload-store selection and cross-turn upload continuity for every Chat
 * SDK platform. Only canonical runtime upload references are restored.
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

  getCanonicalStore(): ScopedRuntimeUploadStore | undefined {
    return this.deps
      .getContext()
      ?.uploads.scoped(createCanonicalChatUploadStoreScope());
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
        return (
          (await this.deps
            .getContext()
            ?.conversations.getMessages(conversationId, { limit: 50 })) ?? []
        );
      },
      restoreAttachment: async (uploadId): Promise<ChatAttachment> => {
        const store = this.getCanonicalStore();
        if (!store) throw new Error("Chat upload store unavailable");
        return chatAttachmentFromStoredUpload(await store.readRecord(uploadId));
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
