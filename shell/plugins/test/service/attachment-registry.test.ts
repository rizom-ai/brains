import { describe, expect, it } from "bun:test";
import type { PublishMediaData } from "@brains/contracts";
import { createSilentLogger } from "@brains/test-utils";
import { AttachmentRegistry } from "../../src/service/attachment-registry";
import { createEntityPluginContext } from "../../src/entity/context";
import { createServicePluginContext } from "../../src/service/context";
import { createMockShell } from "../../src/test/mock-shell";

function createPdfAttachment(filename: string): PublishMediaData {
  return {
    type: "document",
    data: Buffer.from("pdf"),
    mimeType: "application/pdf",
    filename,
  };
}

describe("AttachmentRegistry", () => {
  it("resolves a registered source attachment provider", async () => {
    const registry = AttachmentRegistry.createFresh();
    const attachment = createPdfAttachment("deck-carousel.pdf");

    registry.register("deck", "carousel", {
      resolve: (request) => {
        expect(request.sourceEntityType).toBe("deck");
        expect(request.sourceEntityId).toBe("deck-1");
        expect(request.attachmentType).toBe("carousel");
        return attachment;
      },
    });

    const result = await registry.resolve({
      sourceEntityType: "deck",
      sourceEntityId: "deck-1",
      attachmentType: "carousel",
    });

    expect(result).toEqual(attachment);
  });

  it("returns undefined when no provider exists", async () => {
    const registry = AttachmentRegistry.createFresh();

    const result = await registry.resolve({
      sourceEntityType: "deck",
      sourceEntityId: "deck-1",
      attachmentType: "carousel",
    });

    expect(result).toBeUndefined();
  });

  it("unregisters providers using the returned cleanup function", () => {
    const registry = AttachmentRegistry.createFresh();
    const unregister = registry.register("deck", "carousel", {
      resolve: () => createPdfAttachment("deck-carousel.pdf"),
    });

    expect(registry.has("deck", "carousel")).toBe(true);
    unregister();
    expect(registry.has("deck", "carousel")).toBe(false);
  });

  it("returns optional provider metadata when declared", () => {
    const registry = AttachmentRegistry.createFresh();

    registry.register("deck", "carousel", {
      metadata: { outputEntityType: "document" },
      resolve: () => createPdfAttachment("deck-carousel.pdf"),
    });
    registry.register("post", "legacy", {
      resolve: () => createPdfAttachment("legacy.pdf"),
    });

    expect(registry.getMetadata("deck", "carousel")).toEqual({
      outputEntityType: "document",
    });
    expect(registry.getMetadata("post", "legacy")).toBeUndefined();
    expect(registry.getMetadata("missing", "carousel")).toBeUndefined();
  });
});

describe("plugin context attachments namespace", () => {
  it("registers and resolves attachments through service plugin context", async () => {
    const shell = createMockShell({ logger: createSilentLogger() });
    const context = createServicePluginContext(shell, "test-plugin");
    const attachment = createPdfAttachment("deck-carousel.pdf");

    context.attachments.register("deck", "carousel", {
      resolve: () => attachment,
    });

    expect(context.attachments.hasProvider("deck", "carousel")).toBe(true);
    expect(
      context.attachments.getProviderMetadata("deck", "carousel"),
    ).toBeUndefined();
    const result = await context.attachments.resolve({
      sourceEntityType: "deck",
      sourceEntityId: "deck-1",
      attachmentType: "carousel",
    });

    expect(result).toEqual(attachment);
  });

  it("registers and resolves attachments through entity plugin context", async () => {
    const shell = createMockShell({ logger: createSilentLogger() });
    const context = createEntityPluginContext(shell, "decks");
    const attachment = createPdfAttachment("deck-carousel.pdf");

    context.attachments.register("deck", "carousel", {
      metadata: { outputEntityType: "document" },
      resolve: () => attachment,
    });

    expect(context.attachments.hasProvider("deck", "carousel")).toBe(true);
    expect(context.attachments.getProviderMetadata("deck", "carousel")).toEqual(
      { outputEntityType: "document" },
    );
    const result = await context.attachments.resolve({
      sourceEntityType: "deck",
      sourceEntityId: "deck-1",
      attachmentType: "carousel",
    });

    expect(result).toEqual(attachment);
  });
});
