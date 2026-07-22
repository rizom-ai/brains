import {
  MessageUploadContinuity,
  type ChatAttachment,
  type InterfacePluginContext,
  type RuntimeUploadStore,
} from "@brains/plugins";
import {
  chatAttachmentFromStoredUpload,
  type AgentInput,
} from "./chat-input-builder";
import type { ChatPlatform } from "./types";
import {
  canonicalChatUploadRefKind,
  createCanonicalChatUploadStoreScope,
  createDiscordChatUploadStoreScope,
  createSlackChatUploadStoreScope,
  discordChatUploadRefKind,
  slackChatUploadRefKind,
} from "./upload-store";

interface ChatUploadCoordinatorDeps {
  getContext: () => InterfacePluginContext | undefined;
  logger: {
    debug: (message: string, context?: Record<string, unknown>) => void;
  };
}

/**
 * Owns upload-store selection and cross-turn upload continuity for every Chat
 * SDK platform. Platform upload stores remain isolated while restored
 * agent-facing attachments are migrated to canonical runtime upload refs.
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

  getCanonicalStore(): RuntimeUploadStore | undefined {
    return this.deps
      .getContext()
      ?.uploads.scoped(createCanonicalChatUploadStoreScope());
  }

  getPlatformStore(platform: ChatPlatform): RuntimeUploadStore | undefined {
    const scope =
      platform === "discord"
        ? createDiscordChatUploadStoreScope()
        : createSlackChatUploadStoreScope();
    return this.deps.getContext()?.uploads.scoped(scope);
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
      legacySourceKinds: [
        platform === "discord"
          ? discordChatUploadRefKind
          : slackChatUploadRefKind,
      ],
      loadMessages: async (conversationId): Promise<readonly unknown[]> => {
        return (
          (await this.deps
            .getContext()
            ?.conversations.getMessages(conversationId, { limit: 50 })) ?? []
        );
      },
      restoreAttachment: async (
        uploadId,
        sourceKind,
      ): Promise<ChatAttachment> => {
        const uploadStore =
          sourceKind === canonicalChatUploadRefKind
            ? this.getCanonicalStore()
            : this.getPlatformStore(platform);
        if (!uploadStore) throw new Error("Chat upload store unavailable");
        const resolved = await uploadStore.read(uploadId);
        if (sourceKind !== canonicalChatUploadRefKind) {
          const canonicalStore = this.getCanonicalStore();
          if (!canonicalStore) throw new Error("Chat upload store unavailable");
          const canonical = await canonicalStore.save({
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
        }
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
