import { describe, it, expect } from "bun:test";
import { createSilentLogger } from "@brains/test-utils";
import {
  buildAsyncGenerationFallback,
  buildAttachmentOnlyResponse,
  buildAttachmentOnlyActionsCard,
  filterLiveUploadRefs,
  hydrateUploadAttachments,
} from "../src/attachment-intake";
import type { ChatAttachment, StructuredChatCard } from "../src/agent-types";
import type { ConversationUploadRef } from "../src/conversation-messages";

function actionIds(card: StructuredChatCard | undefined): string[] {
  if (card?.kind !== "actions") {
    throw new Error("Expected an actions card");
  }
  return card.actions.map((action) => action.id);
}

const logger = createSilentLogger();

function fileAttachment(filename: string, mediaType: string): ChatAttachment {
  return {
    kind: "file",
    filename,
    mediaType,
    data: new Uint8Array([1, 2, 3]),
    sizeBytes: 3,
  };
}

function uploadRef(id: string): ConversationUploadRef {
  return {
    filename: `${id}.png`,
    mediaType: "image/png",
    source: { kind: "upload", id },
  };
}

describe("buildAsyncGenerationFallback", () => {
  it("returns guidance for a generating tool result", () => {
    const text = buildAsyncGenerationFallback({
      success: true,
      data: { status: "generating", entityId: "e-1" },
    });
    expect(text).toContain("generating");
  });

  it("returns undefined for anything else", () => {
    expect(buildAsyncGenerationFallback({ success: true, data: {} })).toBe(
      undefined,
    );
    expect(buildAsyncGenerationFallback("nope")).toBe(undefined);
  });
});

describe("buildAttachmentOnlyResponse", () => {
  it("names a single file", () => {
    const text = buildAttachmentOnlyResponse([
      fileAttachment("photo.png", "image/png"),
    ]);
    expect(text).toContain("`photo.png`");
    expect(text).toContain("it");
  });

  it("lists multiple files", () => {
    const text = buildAttachmentOnlyResponse([
      fileAttachment("a.png", "image/png"),
      fileAttachment("b.pdf", "application/pdf"),
    ]);
    expect(text).toContain("`a.png`");
    expect(text).toContain("`b.pdf`");
    expect(text).toContain("these files");
  });
});

describe("buildAttachmentOnlyActionsCard", () => {
  it("returns undefined without attachments", () => {
    expect(buildAttachmentOnlyActionsCard([])).toBe(undefined);
  });

  it("offers a summarize action for multiple attachments", () => {
    const card = buildAttachmentOnlyActionsCard([
      fileAttachment("a.png", "image/png"),
      fileAttachment("b.pdf", "application/pdf"),
    ]);
    expect(actionIds(card)).toEqual(["summarize-uploads"]);
  });

  it("offers image actions for a single image", () => {
    const card = buildAttachmentOnlyActionsCard([
      fileAttachment("a.png", "image/png"),
    ]);
    expect(actionIds(card)).toEqual(["describe-image", "save-image"]);
  });

  it("offers pdf actions for a single pdf", () => {
    const card = buildAttachmentOnlyActionsCard([
      fileAttachment("a.pdf", "application/pdf"),
    ]);
    expect(actionIds(card)).toEqual(["summarize-pdf", "save-document"]);
  });

  it("offers note actions for a single text file", () => {
    const card = buildAttachmentOnlyActionsCard([
      fileAttachment("a.md", "text/markdown"),
    ]);
    expect(actionIds(card)).toEqual(["summarize-upload", "save-upload-note"]);
  });

  it("falls back to a summarize action for unknown types", () => {
    const card = buildAttachmentOnlyActionsCard([
      fileAttachment("a.bin", "application/octet-stream"),
    ]);
    expect(actionIds(card)).toEqual(["summarize-upload"]);
  });
});

describe("filterLiveUploadRefs", () => {
  it("returns empty for no refs or no resolver", async () => {
    expect(
      await filterLiveUploadRefs({ refs: [], resolver: undefined, logger }),
    ).toEqual([]);
    expect(
      await filterLiveUploadRefs({
        refs: [uploadRef("u1")],
        resolver: undefined,
        logger,
      }),
    ).toEqual([]);
  });

  it("keeps refs the resolver can still produce, with refreshed names", async () => {
    const refs = [uploadRef("u1"), uploadRef("u2")];
    const result = await filterLiveUploadRefs({
      refs,
      resolver: async (source) =>
        source.id === "u1"
          ? fileAttachment("fresh-name.png", "image/png")
          : null,
      logger,
    });

    expect(result).toEqual([
      {
        filename: "fresh-name.png",
        mediaType: "image/png",
        source: { kind: "upload", id: "u1" },
      },
    ]);
  });

  it("skips refs whose resolution throws", async () => {
    const result = await filterLiveUploadRefs({
      refs: [uploadRef("u1")],
      resolver: async () => {
        throw new Error("gone");
      },
      logger,
    });
    expect(result).toEqual([]);
  });
});

describe("hydrateUploadAttachments", () => {
  it("passes through when the turn already has attachments", async () => {
    const current = [fileAttachment("live.png", "image/png")];
    const result = await hydrateUploadAttachments({
      currentAttachments: current,
      uploadRefs: [uploadRef("u1")],
      resolver: async () => fileAttachment("old.png", "image/png"),
      logger,
    });
    expect(result).toBe(current);
  });

  it("passes through without a resolver or with multiple refs", async () => {
    expect(
      await hydrateUploadAttachments({
        currentAttachments: [],
        uploadRefs: [uploadRef("u1")],
        resolver: undefined,
        logger,
      }),
    ).toEqual([]);

    expect(
      await hydrateUploadAttachments({
        currentAttachments: [],
        uploadRefs: [uploadRef("u1"), uploadRef("u2")],
        resolver: async () => fileAttachment("old.png", "image/png"),
        logger,
      }),
    ).toEqual([]);
  });

  it("hydrates a single prior upload", async () => {
    const stored = fileAttachment("stored.png", "image/png");
    const result = await hydrateUploadAttachments({
      currentAttachments: [],
      uploadRefs: [uploadRef("u1")],
      resolver: async () => stored,
      logger,
    });
    expect(result).toEqual([stored]);
  });

  it("returns the original attachments when hydration fails", async () => {
    const result = await hydrateUploadAttachments({
      currentAttachments: [],
      uploadRefs: [uploadRef("u1")],
      resolver: async () => {
        throw new Error("expired");
      },
      logger,
    });
    expect(result).toEqual([]);
  });
});
