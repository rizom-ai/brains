import { describe, expect, it } from "bun:test";
import { MessageUploadContinuity } from "../../src/message-interface/upload-continuity";
import type { ChatAttachment } from "../../src/contracts/agent";

const firstUpload: ChatAttachment = {
  kind: "text",
  filename: "first.txt",
  mediaType: "text/plain",
  content: "first",
  sizeBytes: 5,
  source: { kind: "discord-chat-upload", id: "upload-1" },
};

const secondUpload: ChatAttachment = {
  kind: "text",
  filename: "second.txt",
  mediaType: "text/plain",
  content: "second",
  sizeBytes: 6,
  source: { kind: "discord-chat-upload", id: "upload-2" },
};

describe("MessageUploadContinuity", () => {
  it("returns current-turn attachments unchanged", async () => {
    const continuity = new MessageUploadContinuity({
      sourceKind: "discord-chat-upload",
      loadMessages: async (): Promise<readonly unknown[]> => [],
      restoreAttachment: async (): Promise<ChatAttachment> => firstUpload,
    });

    const selected = await continuity.selectPriorUploads({
      conversationId: "conv-1",
      message: "summarize this",
      currentAttachments: [firstUpload],
      canRestore: true,
    });

    expect(selected).toEqual([firstUpload]);
  });

  it("does not restore prior uploads when caller is not allowed", async () => {
    const continuity = new MessageUploadContinuity({
      sourceKind: "discord-chat-upload",
      loadMessages: async (): Promise<readonly unknown[]> => [
        storedUserUpload("upload-1"),
      ],
      restoreAttachment: async (): Promise<ChatAttachment> => firstUpload,
    });

    const selected = await continuity.selectPriorUploads({
      conversationId: "conv-1",
      message: "summarize latest",
      currentAttachments: [],
      canRestore: false,
    });

    expect(selected).toEqual([]);
  });

  it("selects remembered uploads by filename", async () => {
    const continuity = new MessageUploadContinuity({
      sourceKind: "discord-chat-upload",
      loadMessages: async (): Promise<readonly unknown[]> => [],
      restoreAttachment: async (): Promise<ChatAttachment> => firstUpload,
    });
    continuity.remember("conv-1", [firstUpload, secondUpload]);

    const selected = await continuity.selectPriorUploads({
      conversationId: "conv-1",
      message: "summarize first.txt",
      currentAttachments: [],
      canRestore: true,
    });

    expect(selected).toEqual([firstUpload]);
  });

  it("restores prior uploads from stored conversation metadata", async () => {
    const continuity = new MessageUploadContinuity({
      sourceKind: "discord-chat-upload",
      loadMessages: async (): Promise<readonly unknown[]> => [
        storedUserUpload("upload-1"),
        storedUserUpload("upload-2"),
      ],
      restoreAttachment: async (uploadId): Promise<ChatAttachment> => {
        return uploadId === "upload-1" ? firstUpload : secondUpload;
      },
    });

    const selected = await continuity.selectPriorUploads({
      conversationId: "conv-1",
      message: "summarize second.txt",
      currentAttachments: [],
      canRestore: true,
    });

    expect(selected).toEqual([secondUpload]);
  });

  it("skips stale restored uploads and reports restore errors", async () => {
    const restoreErrors: unknown[] = [];
    const continuity = new MessageUploadContinuity({
      sourceKind: "discord-chat-upload",
      loadMessages: async (): Promise<readonly unknown[]> => [
        storedUserUpload("missing"),
        storedUserUpload("upload-2"),
      ],
      restoreAttachment: async (uploadId): Promise<ChatAttachment> => {
        if (uploadId === "missing") throw new Error("missing upload");
        return secondUpload;
      },
      onRestoreError: (error): void => {
        restoreErrors.push(error);
      },
    });

    const uploads = await continuity.getRecentUploads("conv-1");

    expect(uploads).toEqual([secondUpload]);
    expect(restoreErrors).toHaveLength(1);
  });

  it("clears remembered uploads", async () => {
    const continuity = new MessageUploadContinuity({
      sourceKind: "discord-chat-upload",
      loadMessages: async (): Promise<readonly unknown[]> => [],
      restoreAttachment: async (): Promise<ChatAttachment> => firstUpload,
    });
    continuity.remember("conv-1", [firstUpload]);
    continuity.clear();

    const uploads = await continuity.getRecentUploads("conv-1");

    expect(uploads).toEqual([]);
  });
});

function storedUserUpload(uploadId: string): unknown {
  return {
    role: "user",
    metadata: {
      attachments: [
        {
          kind: "text",
          filename: `${uploadId}.txt`,
          mediaType: "text/plain",
          source: { kind: "discord-chat-upload", id: uploadId },
        },
      ],
    },
  };
}
