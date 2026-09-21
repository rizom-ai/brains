import { createMockShell } from "../../src/test/mock-shell";
import { describe, expect, it, mock } from "bun:test";
import assert from "node:assert/strict";
import {
  attachmentFileSchema,
  type AttachmentFile,
  type AttachmentFileConsumer,
} from "../../src/service/attachment-file";
import { createSilentLogger } from "@brains/test-utils";
import {
  AttachmentRegistry,
  type FileAttachmentProvider,
} from "../../src/service/attachment-registry";
import { createEntityPluginContext } from "../../src/entity/context";
import { createServicePluginContext } from "../../src/service/context";

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
function provider(): FileAttachmentProvider {
  return {
    withFile: async (_request, use, options): ReturnType<typeof use> =>
      use(file, options?.signal ?? signal),
  };
}

describe("AttachmentRegistry", () => {
  it("has no buffered resolver and validates file descriptors without payloads", () => {
    const registry = AttachmentRegistry.createFresh();
    expect("resolve" in registry).toBe(false);
    for (const sha256 of [undefined, "a".repeat(63), "g".repeat(64)])
      expect(attachmentFileSchema.safeParse({ ...file, sha256 }).success).toBe(
        false,
      );
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
    const withFile = mock(async (): Promise<undefined> => undefined);
    registry.register("post", "og-image", { withFile });
    const caller = new AbortController();
    const primary = new Error("file request cancelled");
    caller.abort(primary);
    await assert.rejects(
      registry.withFile(fileRequest, async (): Promise<void> => undefined, {
        signal: caller.signal,
      }),
      (error: unknown) => error === primary,
    );
    expect(withFile).not.toHaveBeenCalled();
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
      withFile: async (_request, use): Promise<never> => {
        // Fault injection: a broken provider masks the consumer failure in cleanup.
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
  it("forwards the source request and returns the consumer result", async () => {
    const registry = AttachmentRegistry.createFresh();
    registry.register("post", "og-image", {
      withFile: async (request, use): ReturnType<typeof use> => {
        expect(request).toEqual(fileRequest);
        return use(file, signal);
      },
    });
    expect(
      await registry.withFile(
        fileRequest,
        async (received): Promise<string> => received.filename,
      ),
    ).toBe("og.png");
  });
  it("returns undefined without entering a consumer when no provider exists", async () => {
    const consume = mock(async (): Promise<void> => undefined);
    expect(
      await AttachmentRegistry.createFresh().withFile(fileRequest, consume),
    ).toBeUndefined();
    expect(consume).not.toHaveBeenCalled();
  });
  it("unregisters providers and exposes optional capability metadata", () => {
    const registry = AttachmentRegistry.createFresh();
    const unregister = registry.register("post", "og-image", {
      ...provider(),
      metadata: { outputEntityType: "image", targetField: "ogImageId" },
    });
    registry.register("post", "other", provider());
    expect(registry.has("post", "og-image")).toBe(true);
    expect(registry.getMetadata("post", "og-image")).toEqual({
      outputEntityType: "image",
      targetField: "ogImageId",
    });
    expect(registry.getMetadata("post", "other")).toBeUndefined();
    expect(registry.getMetadata("missing", "other")).toBeUndefined();
    unregister();
    expect(registry.has("post", "og-image")).toBe(false);
  });
});

describe("plugin context attachments namespace", () => {
  for (const [label, createContext] of [
    ["entity", createEntityPluginContext],
    ["service", createServicePluginContext],
  ] as const) {
    it(`${label} context joins file use and cleanup without retracting late-cancelled results`, async () => {
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
        metadata: { outputEntityType: "image" },
        withFile: async (_request, use, options): ReturnType<typeof use> => {
          assert.ok(options?.signal);
          const result = await use(file, options.signal);
          retiring.resolve();
          await releaseCleanup.promise;
          return result;
        },
      });
      expect("resolve" in context.attachments).toBe(false);
      expect(context.attachments.hasProvider("post", "og-image")).toBe(true);
      expect(
        context.attachments.getProviderMetadata("post", "og-image"),
      ).toEqual({ outputEntityType: "image" });
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
});
