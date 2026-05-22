import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { readFile, rm } from "fs/promises";
import { tmpdir } from "os";
import { dirname } from "path";
import { AttachmentRegistry } from "@brains/plugins";
import {
  createPluginHarness,
  expectError,
  expectSuccess,
} from "@brains/plugins/test";
import { MediaToolsPlugin } from "../src/plugin";
import { MAX_INLINE_PREVIEW_BYTES } from "../src/tools";

describe("media-tools preview-attachment tool", () => {
  let harness: ReturnType<typeof createPluginHarness>;
  let writtenPaths: string[];

  beforeEach(() => {
    AttachmentRegistry.resetInstance();
    harness = createPluginHarness();
    writtenPaths = [];
  });

  afterEach(async () => {
    harness.reset();
    await Promise.all(
      writtenPaths.map((path) =>
        rm(dirname(path), { recursive: true, force: true }),
      ),
    );
  });

  it("resolves a registered provider and writes the data to a temp file", async () => {
    await harness.installPlugin(new MediaToolsPlugin());

    const ctx = harness.getEntityContext("test");
    ctx.attachments.register("deck", "carousel", {
      resolve: async () => ({
        type: "document",
        data: Buffer.from("%PDF-stub"),
        mimeType: "application/pdf",
        filename: "stub.pdf",
      }),
    });

    const result = await harness.executeTool("media-tools_preview-attachment", {
      entityType: "deck",
      entityId: "deck-1",
      attachmentType: "carousel",
    });

    expectSuccess(result);
    const data = result.data as {
      path: string;
      filename: string;
      mimeType: string;
      bytes: number;
      inline: boolean;
      maxInlineBytes: number;
      contentBase64: string;
    };
    writtenPaths.push(data.path);
    expect(data.path.endsWith("/stub.pdf")).toBe(true);
    expect(
      dirname(data.path).startsWith(`${tmpdir()}/brain-media-preview-`),
    ).toBe(true);
    expect(data.filename).toBe("stub.pdf");
    expect(data.mimeType).toBe("application/pdf");
    expect(data.bytes).toBe(9);
    expect(data.inline).toBe(true);
    expect(data.maxInlineBytes).toBe(MAX_INLINE_PREVIEW_BYTES);
    expect(Buffer.from(data.contentBase64, "base64").toString()).toBe(
      "%PDF-stub",
    );

    const written = await readFile(data.path);
    expect(written.toString()).toBe("%PDF-stub");
  });

  it("omits inline content when the artifact exceeds the inline size limit", async () => {
    await harness.installPlugin(new MediaToolsPlugin());

    const ctx = harness.getEntityContext("test");
    ctx.attachments.register("deck", "carousel", {
      resolve: async () => ({
        type: "document",
        data: Buffer.alloc(MAX_INLINE_PREVIEW_BYTES + 1, "x"),
        mimeType: "application/pdf",
        filename: "large.pdf",
      }),
    });

    const result = await harness.executeTool("media-tools_preview-attachment", {
      entityType: "deck",
      entityId: "deck-1",
      attachmentType: "carousel",
    });

    expectSuccess(result);
    const data = result.data as {
      path: string;
      bytes: number;
      inline: boolean;
      contentBase64?: string;
    };
    writtenPaths.push(data.path);
    expect(data.path.endsWith("/large.pdf")).toBe(true);
    expect(
      dirname(data.path).startsWith(`${tmpdir()}/brain-media-preview-`),
    ).toBe(true);
    expect(data.bytes).toBe(MAX_INLINE_PREVIEW_BYTES + 1);
    expect(data.inline).toBe(false);
    expect(data.contentBase64).toBeUndefined();
  });

  it("reports an error when no provider is registered for the pair", async () => {
    await harness.installPlugin(new MediaToolsPlugin());

    const result = await harness.executeTool("media-tools_preview-attachment", {
      entityType: "deck",
      entityId: "deck-1",
      attachmentType: "carousel",
    });

    expectError(result);
    expect(result.error).toContain("No attachment provider");
  });

  it("reports an error when the provider returns undefined", async () => {
    await harness.installPlugin(new MediaToolsPlugin());

    const ctx = harness.getEntityContext("test");
    ctx.attachments.register("deck", "carousel", {
      resolve: async () => undefined,
    });

    const result = await harness.executeTool("media-tools_preview-attachment", {
      entityType: "deck",
      entityId: "missing",
      attachmentType: "carousel",
    });

    expectError(result);
    expect(result.error).toContain("did not produce media");
  });
});
