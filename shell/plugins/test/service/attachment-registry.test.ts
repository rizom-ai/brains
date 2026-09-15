import { createMockShell } from "../../src/test/mock-shell";
import { describe, expect, it, mock } from "bun:test";
import assert from "node:assert/strict";
import {
  attachmentFileSchema,
  type AttachmentFile,
  type AttachmentFileConsumer,
} from "../../src/service/attachment-file";
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

const fileRequest = {
  sourceEntityType: "post",
  sourceEntityId: "post-1",
  attachmentType: "og-image",
};
const file: AttachmentFile = {
  type: "image",
  mimeType: "image/png",
  filename: "og.png",
  sha256: "a".repeat(64),
  source: { sourceFile: "/trusted/og.png", sizeBytes: 123 },
};
const signal = new AbortController().signal;
const buffered = (): never => {
  throw new Error("Buffered resolution forbidden");
};

describe("AttachmentRegistry", () => {
  it("never falls back to buffered resolution and validates file bounds", async () => {
    const registry = AttachmentRegistry.createFresh();
    const resolve = mock(buffered);
    registry.register("post", "og-image", { resolve });
    await assert.rejects(
      registry.withFile(fileRequest, async (): Promise<void> => undefined),
      /does not support file handoff/,
    );
    expect(resolve).not.toHaveBeenCalled();
    for (const sha256 of [undefined, "a".repeat(63), "g".repeat(64)]) {
      expect(attachmentFileSchema.safeParse({ ...file, sha256 }).success).toBe(
        false,
      );
    }
    expect(
      attachmentFileSchema.safeParse({
        ...file,
        source: { ...file.source, sourceFile: "relative.png" },
      }).success,
    ).toBe(false);
    expect(
      attachmentFileSchema.safeParse({
        ...file,
        source: { ...file.source, sizeBytes: 100 * 1024 * 1024 + 1 },
      }).success,
    ).toBe(false);
    expect(
      attachmentFileSchema.safeParse({ ...file, mimeType: "application/pdf" })
        .success,
    ).toBe(false);
  });

  it("rejects pre-cancelled admission without invoking the provider", async () => {
    const registry = AttachmentRegistry.createFresh();
    const provider = mock(async (): Promise<undefined> => undefined);
    registry.register("post", "og-image", { withFile: provider });
    const caller = new AbortController();
    const primary = new Error("file request cancelled");
    caller.abort(primary);
    await assert.rejects(
      registry.withFile(fileRequest, async (): Promise<void> => undefined, {
        signal: caller.signal,
      }),
      (error: unknown) => error === primary,
    );
    expect(provider).not.toHaveBeenCalled();
  });

  it("allows only one consumer admission even if the provider handles the duplicate error", async () => {
    const registry = AttachmentRegistry.createFresh();
    registry.register("post", "og-image", {
      withFile: async (_request, use): ReturnType<typeof use> => {
        const first = use(file, signal);
        await assert.rejects(use(file, signal), /closed or already entered/);
        return first;
      },
    });
    const consume = mock(async (): Promise<string> => "acknowledged");
    await assert.rejects(
      registry.withFile(fileRequest, consume),
      /closed or already entered/,
    );
    expect(consume).toHaveBeenCalledTimes(1);
  });

  it("rejects byte-bearing descriptors without reading their payload", async () => {
    const registry = AttachmentRegistry.createFresh();
    let reads = 0;
    const dirty = {
      ...file,
      get data(): never {
        reads++;
        throw new Error("Payload accessed");
      },
    };
    registry.register("post", "og-image", {
      resolve: buffered,
      withFile: async (_request, use): ReturnType<typeof use> =>
        use(dirty, signal),
    });
    const consume = mock(async (): Promise<void> => undefined);
    await assert.rejects(registry.withFile(fileRequest, consume));
    expect(consume).not.toHaveBeenCalled();
    expect(reads).toBe(0);
  });

  it("joins the consumer even when a provider returns prematurely", async () => {
    const registry = AttachmentRegistry.createFresh();
    const entered = Promise.withResolvers<void>();
    const release = Promise.withResolvers<void>();
    registry.register("post", "og-image", {
      resolve: buffered,
      withFile: async (_request, use): Promise<undefined> => {
        void use(file, signal);
        return undefined;
      },
    });
    let settled = false;
    const work = registry
      .withFile(fileRequest, async (): Promise<string> => {
        entered.resolve();
        await release.promise;
        return "published";
      })
      .finally(() => {
        settled = true;
      });
    const rejected = assert.rejects(work, /consumer outcome/);
    try {
      await entered.promise;
      expect(settled).toBe(false);
    } finally {
      release.resolve();
      await rejected;
    }
  });

  it("preserves consumer failure and subsequent provider cleanup failure", async () => {
    const registry = AttachmentRegistry.createFresh();
    const primary = new Error("consumer failed");
    const secondary = new Error("provider cleanup failed");
    registry.register("post", "og-image", {
      resolve: buffered,
      withFile: async (_request, use): Promise<never> => {
        // Fault injection: the provider masks the consumer error during cleanup.
        await use(file, signal).catch(() => undefined);
        throw secondary;
      },
    });
    await assert.rejects(
      registry.withFile(fileRequest, async (): Promise<never> => {
        throw primary;
      }),
      (error: unknown) => {
        assert.ok(error instanceof AggregateError);
        expect(error.errors).toEqual([primary, secondary]);
        expect(error.cause).toBe(primary);
        return true;
      },
    );
  });

  it("closes callback admission after provider settlement", async () => {
    const registry = AttachmentRegistry.createFresh();
    let late: AttachmentFileConsumer<unknown> | undefined;
    registry.register("post", "og-image", {
      resolve: buffered,
      withFile: async (_request, use): Promise<undefined> => {
        late = use;
        return undefined;
      },
    });
    const consume = mock(async (): Promise<void> => undefined);
    expect(await registry.withFile(fileRequest, consume)).toBeUndefined();
    assert.ok(late);
    await assert.rejects(late(file, signal), /closed or already entered/);
    expect(consume).not.toHaveBeenCalled();
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
  for (const [label, createContext] of [
    ["entity", createEntityPluginContext],
    ["service", createServicePluginContext],
  ] as const) {
    it(`${label} context joins file use and producer cleanup without retracting late-cancelled results`, async () => {
      const context = createContext(
        createMockShell({ logger: createSilentLogger() }),
        "file-plugin",
      );
      const entered = Promise.withResolvers<void>();
      const releaseUse = Promise.withResolvers<void>();
      const retiring = Promise.withResolvers<void>();
      const releaseCleanup = Promise.withResolvers<void>();
      const caller = new AbortController();
      context.attachments.register("post", "og-image", {
        withFile: async (_request, use, options): ReturnType<typeof use> => {
          assert.ok(options?.signal);
          const result = await use(file, options.signal);
          retiring.resolve();
          await releaseCleanup.promise;
          return result;
        },
      });
      await assert.rejects(
        context.attachments.resolve(fileRequest),
        /does not support buffered resolution/,
      );
      let settled = false;
      const work = context.attachments
        .withFile(
          fileRequest,
          async (received, receivedSignal): Promise<string> => {
            expect(received).toEqual(file);
            expect(receivedSignal).toBe(caller.signal);
            entered.resolve();
            await releaseUse.promise;
            return "publication acknowledged";
          },
          { signal: caller.signal },
        )
        .finally(() => {
          settled = true;
        });
      try {
        await entered.promise;
        expect(settled).toBe(false);
        releaseUse.resolve();
        await retiring.promise;
        caller.abort(new Error("late cancellation"));
        expect(settled).toBe(false);
      } finally {
        releaseUse.resolve();
        releaseCleanup.resolve();
      }
      expect(await work).toBe("publication acknowledged");
    });
  }

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
