import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdtemp, readFile, rm } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { AttachmentRegistry } from "@brains/plugins";
import {
  createPluginHarness,
  expectError,
  expectSuccess,
} from "@brains/plugins/test";
import { MediaToolsPlugin } from "../src/plugin";

describe("media-tools preview-attachment tool", () => {
  let harness: ReturnType<typeof createPluginHarness>;
  let outputDir: string;

  beforeEach(async () => {
    AttachmentRegistry.resetInstance();
    harness = createPluginHarness();
    outputDir = await mkdtemp(join(tmpdir(), "media-tools-test-"));
  });

  afterEach(async () => {
    harness.reset();
    await rm(outputDir, { recursive: true, force: true });
  });

  it("resolves a registered provider and writes the data to disk", async () => {
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
      outputDir,
    });

    expectSuccess(result);
    const data = result.data as {
      path: string;
      mimeType: string;
      bytes: number;
    };
    expect(data.path).toBe(join(outputDir, "stub.pdf"));
    expect(data.mimeType).toBe("application/pdf");
    expect(data.bytes).toBe(9);

    const written = await readFile(data.path);
    expect(written.toString()).toBe("%PDF-stub");
  });

  it("reports an error when no provider is registered for the pair", async () => {
    await harness.installPlugin(new MediaToolsPlugin());

    const result = await harness.executeTool("media-tools_preview-attachment", {
      entityType: "deck",
      entityId: "deck-1",
      attachmentType: "carousel",
      outputDir,
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
      outputDir,
    });

    expectError(result);
    expect(result.error).toContain("did not produce media");
  });
});
