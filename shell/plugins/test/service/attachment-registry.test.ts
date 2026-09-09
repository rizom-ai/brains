import { createMockShell } from "../../src/test/mock-shell";
import { describe, expect, it } from "bun:test";
import type { PublishMediaData } from "@brains/contracts";
import { createSilentLogger } from "@brains/test-utils";
import { AttachmentRegistry } from "../../src/service/attachment-registry";
import { createEntityPluginContext } from "../../src/entity/context";
import { createServicePluginContext } from "../../src/service/context";

function createPdfAttachment(filename: string): PublishMediaData {
  return {
    type: "document",
    data: Buffer.from("pdf"),
    mimeType: "application/pdf",
    filename,
  };
}

describe("AttachmentRegistry", () => {
  it("returns detached metadata without publishing undeclared provider fields", async () => {
    const registry = AttachmentRegistry.createFresh();
    const metadata = {
      outputEntityType: "image" as const,
      targetField: "coverImageId" as const,
      privateRuntime: { remove: (): void => {} },
    };
    const provider = {
      metadata,
      filename: "bound.pdf",
      resolve(): PublishMediaData {
        return createPdfAttachment(this.filename);
      },
    };
    registry.register("deck", "cover", provider);
    const result = registry.getMetadata("deck", "cover");
    expect(result).toEqual({
      outputEntityType: "image",
      targetField: "coverImageId",
    });
    expect(result).not.toBe(metadata);
    if (!result) throw new Error("Attachment metadata missing");
    result.outputEntityType = "document";
    result.targetField = "ogImageId";
    Reflect.set(metadata, "outputEntityType", "document");
    expect(registry.getMetadata("deck", "cover")).toEqual({
      outputEntityType: "image",
      targetField: "coverImageId",
    });
    const resolve = registry.get("deck", "cover")?.resolve;
    if (!resolve) throw new Error("Attachment provider missing");
    expect(
      await resolve({
        sourceEntityType: "deck",
        sourceEntityId: "one",
        attachmentType: "cover",
      }),
    ).toMatchObject({ filename: "bound.pdf" });
  });

  it("validates metadata atomically and reads it once without evaluating undeclared getters", () => {
    const registry = AttachmentRegistry.createFresh();
    const original = registry.register("deck", "cover", {
      metadata: { outputEntityType: "document" },
      resolve: () => undefined,
    });
    const invalid = { outputEntityType: "image" as const };
    Reflect.set(invalid, "outputEntityType", "video");
    expect(() =>
      registry.register("deck", "cover", {
        metadata: invalid,
        resolve: () => undefined,
      }),
    ).toThrow();
    expect(registry.getMetadata("deck", "cover")).toEqual({
      outputEntityType: "document",
    });
    original();
    expect(registry.has("deck", "cover")).toBe(false);
    let reads = 0;
    const metadata = {
      outputEntityType: "image" as const,
      get privateRuntime(): never {
        throw new Error("Undeclared getter was read");
      },
    };
    registry.register("deck", "cover", {
      get metadata() {
        reads++;
        return metadata;
      },
      resolve: () => undefined,
    });
    expect(registry.getMetadata("deck", "cover")).toEqual({
      outputEntityType: "image",
    });
    expect(registry.getMetadata("deck", "cover")).toEqual({
      outputEntityType: "image",
    });
    expect(reads).toBe(1);
  });

  it("does not let stale cleanup remove a replacement provider", async () => {
    const registry = AttachmentRegistry.createFresh();
    const old = registry.register("deck", "carousel", {
      resolve: () => createPdfAttachment("old.pdf"),
    });
    const replacement = registry.register("deck", "carousel", {
      resolve: () => createPdfAttachment("new.pdf"),
    });
    old();
    old();
    expect(registry.has("deck", "carousel")).toBe(true);
    expect(
      await registry.resolve({
        sourceEntityType: "deck",
        sourceEntityId: "one",
        attachmentType: "carousel",
      }),
    ).toMatchObject({ filename: "new.pdf" });
    replacement();
    expect(registry.has("deck", "carousel")).toBe(false);
  });

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
