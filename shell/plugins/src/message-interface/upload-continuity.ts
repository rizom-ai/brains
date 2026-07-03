import type { ChatAttachment } from "../contracts/agent";
import { collectUploadIdsFromStoredMessages } from "./stored-message-metadata";

export type MessageUploadConversationLoader = (
  conversationId: string,
) => Promise<readonly unknown[]>;

export type MessageUploadAttachmentRestorer = (
  uploadId: string,
) => Promise<ChatAttachment>;

export interface MessageUploadContinuityOptions {
  sourceKind: string;
  loadMessages: MessageUploadConversationLoader;
  restoreAttachment: MessageUploadAttachmentRestorer;
  maxRecent?: number | undefined;
  onLoadError?: (error: unknown, conversationId: string) => void;
  onRestoreError?: (error: unknown, uploadId: string) => void;
}

export interface SelectPriorUploadsInput {
  conversationId: string;
  currentAttachments: ChatAttachment[];
  canRestore: boolean;
}

export class MessageUploadContinuity {
  private readonly options: MessageUploadContinuityOptions;
  private readonly recentUploads = new Map<string, ChatAttachment[]>();
  private readonly maxRecent: number;

  public constructor(options: MessageUploadContinuityOptions) {
    this.options = options;
    this.maxRecent = options.maxRecent ?? 20;
  }

  public remember(conversationId: string, attachments: ChatAttachment[]): void {
    if (attachments.length === 0) return;

    const existing = this.recentUploads.get(conversationId) ?? [];
    this.recentUploads.set(
      conversationId,
      [...existing, ...attachments].slice(-this.maxRecent),
    );
  }

  public clear(): void {
    this.recentUploads.clear();
  }

  public async selectPriorUploads({
    conversationId,
    currentAttachments,
    canRestore,
  }: SelectPriorUploadsInput): Promise<ChatAttachment[]> {
    if (currentAttachments.length > 0) return currentAttachments;
    if (!canRestore) return currentAttachments;

    const uploads = await this.getRecentUploads(conversationId);
    if (uploads.length === 0) return currentAttachments;

    // Return the full remembered set; resolving which upload the user means
    // ("it", "the latest") is the model's job via typed tool args, not ours.
    return uploads;
  }

  public async getRecentUploads(
    conversationId: string,
  ): Promise<ChatAttachment[]> {
    const existing = this.recentUploads.get(conversationId) ?? [];
    if (existing.length > 0) return existing;

    const restored = await this.restoreRecentUploads(conversationId);
    if (restored.length > 0) {
      this.recentUploads.set(conversationId, restored.slice(-this.maxRecent));
    }
    return restored;
  }

  private async restoreRecentUploads(
    conversationId: string,
  ): Promise<ChatAttachment[]> {
    const messages = await this.loadMessages(conversationId);
    const uploadIds = collectUploadIdsFromStoredMessages(messages, {
      sourceKind: this.options.sourceKind,
      role: "user",
    });
    const uploads: ChatAttachment[] = [];
    for (const uploadId of uploadIds) {
      const upload = await this.restoreAttachment(uploadId);
      if (upload) uploads.push(upload);
    }
    return uploads;
  }

  private async loadMessages(
    conversationId: string,
  ): Promise<readonly unknown[]> {
    try {
      return await this.options.loadMessages(conversationId);
    } catch (error) {
      this.options.onLoadError?.(error, conversationId);
      return [];
    }
  }

  private async restoreAttachment(
    uploadId: string,
  ): Promise<ChatAttachment | undefined> {
    try {
      return await this.options.restoreAttachment(uploadId);
    } catch (error) {
      this.options.onRestoreError?.(error, uploadId);
      return undefined;
    }
  }
}
