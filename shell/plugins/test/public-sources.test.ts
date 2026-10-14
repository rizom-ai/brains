import { describe, expect, it, spyOn } from "bun:test";
import { createTestEntity } from "@brains/entity-service/test";
import { SdkError } from "@brains/contracts";
import { caughtError } from "@brains/test-utils";
import { z } from "@brains/utils/zod";
import { createPublicSources } from "../src/internal/public-sources";
import { createInterfaceEntityAccess } from "../src/interface/interface-entity-access";
import { createMockEntityService } from "../src/test/mock-entity-service";
import { createMockEntityStore } from "../src/test/mock-entity-store";
import { createPluginHarness } from "../src/test/harness";
import { defineInterface, instantiatePluginPackageDefinition } from "../src";

const signal = new AbortController().signal;
function fixture(): {
  sources: ReturnType<typeof createPublicSources>;
  store: ReturnType<typeof createMockEntityStore>;
  service: ReturnType<typeof createMockEntityService>;
  lifetime: AbortController;
} {
  const store = createMockEntityStore();
  const service = createMockEntityService(store);
  spyOn(service, "getEntity");
  const lifetime = new AbortController();
  const sources = createPublicSources(
    createInterfaceEntityAccess(service, "a2a"),
    "https://brain.example",
    {
      post: { label: "Essay", citable: true },
      book: { label: "Book", citable: false },
      note: { label: "Note" },
    },
    lifetime.signal,
  );
  return { sources, store, service, lifetime };
}

describe("public source reader", () => {
  it("rebuilds a detached citation from current public, published data without supplied prose", async () => {
    const { sources, store, service } = fixture();
    store.entities.set(
      "one",
      createTestEntity("post", {
        id: "one",
        visibility: "public",
        metadata: {
          title: "Current title",
          slug: "canonical",
          status: "published",
          brain: { name: "Forged" },
        },
      }),
    );
    const refs = [{ entityType: "post", id: "one" }];
    const result = await sources.resolve([...refs, ...refs], signal);
    expect(result).toEqual([
      {
        id: "post:one",
        source: "post",
        title: "Current title",
        entityType: "post",
        entityId: "one",
        url: "https://brain.example/essays/canonical",
      },
    ]);
    expect(service.getEntity).toHaveBeenCalledTimes(1);
    expect(service.getEntity).toHaveBeenCalledWith({
      ...refs[0],
      visibilityScope: "public",
      publishedOnly: true,
    });
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result[0])).toBe(true);
    expect(Object.keys(sources)).toEqual(["resolve"]);
    store.entities.set(
      "one",
      createTestEntity("post", {
        id: "one",
        visibility: "restricted",
        metadata: { title: "Now private", status: "published" },
      }),
    );
    expect(await sources.resolve(refs, signal)).toEqual([]);
    expect(result[0]?.title).toBe("Current title");
  });

  it("excludes drafts, missing records, unconfigured and noncitable types, and per-record exclusions", async () => {
    const { sources, store } = fixture();
    const cases = [
      { entityType: "post", id: "draft", metadata: { status: "draft" } },
      {
        entityType: "post",
        id: "excluded",
        metadata: { status: "published", citable: false },
      },
      { entityType: "book", id: "title", metadata: { citable: true } },
      { entityType: "note", id: "not-opted-in", metadata: {} },
      { entityType: "unknown", id: "unrouted", metadata: {} },
    ];
    for (const entry of cases)
      store.entities.set(
        entry.id,
        createTestEntity(entry.entityType, { ...entry, visibility: "public" }),
      );
    expect(
      await sources.resolve(
        [
          ...cases.map(({ entityType, id }) => ({ entityType, id })),
          { entityType: "post", id: "missing" },
        ],
        signal,
      ),
    ).toEqual([]);
  });

  it("refuses oversized or authority-bearing inputs before reading", async () => {
    const { sources, service } = fixture();
    for (const refs of [
      Array.from({ length: 21 }, () => ({ entityType: "post", id: "one" })),
      [{ entityType: "post", id: "x".repeat(513) }],
      [{ entityType: "post", id: "one", visibilityScope: "restricted" }],
    ]) {
      expect(
        await sources.resolve(refs, signal).catch(caughtError),
      ).toBeInstanceOf(SdkError);
    }
    expect(service.getEntity).not.toHaveBeenCalled();
  });

  it("refuses admission after caller or installed lifetime cancellation", async () => {
    const { sources, service, lifetime } = fixture();
    expect(
      await sources.resolve([], AbortSignal.abort("caller")).catch(caughtError),
    ).toBeInstanceOf(SdkError);
    lifetime.abort();
    expect(await sources.resolve([], signal).catch(caughtError)).toBeInstanceOf(
      SdkError,
    );
    expect(service.getEntity).not.toHaveBeenCalled();
  });

  it("refuses a read result after cancellation and retains its local reason", async () => {
    const { sources, service, store } = fixture();
    store.entities.set(
      "one",
      createTestEntity("post", { id: "one", visibility: "public" }),
    );
    const caller = new AbortController();
    const reason = new Error("Caller stopped");
    const pending = sources.resolve(
      [{ entityType: "post", id: "one" }],
      caller.signal,
    );
    caller.abort(reason);
    const error = await pending.catch(caughtError);
    expect(service.getEntity).toHaveBeenCalledTimes(1);
    expect(error).toBeInstanceOf(SdkError);
    if (!(error instanceof SdkError)) throw new Error("Expected SDK refusal");
    expect(error.code).toBe("cancelled");
    expect(error.cause).toBeInstanceOf(SdkError);
    if (!(error.cause instanceof SdkError))
      throw new Error("Expected local cancellation cause");
    expect(error.cause.cause).toBe(reason);
  });

  it("keeps storage diagnostics local behind a coded failure", async () => {
    const { sources, service } = fixture();
    const cause = new Error("PRIVATE database path");
    spyOn(service, "getEntity").mockRejectedValue(cause);
    const error = await sources
      .resolve([{ entityType: "post", id: "one" }], signal)
      .catch(caughtError);
    expect(error).toBeInstanceOf(SdkError);
    if (!(error instanceof SdkError)) throw new Error("Expected SDK refusal");
    expect(error.code).toBe("handler_failed");
    expect(error.cause).toBe(cause);
    expect(error.publicMessage).not.toContain("PRIVATE");
  });

  it("expires the installed interface reader on shutdown", async () => {
    const harness = createPluginHarness({ domain: "brain.example" });
    let sources: ReturnType<typeof createPublicSources> | undefined;
    const definition = defineInterface({
      id: "citations",
      config: z.object({}),
      setup: (context) => {
        sources = context.publicSources;
        return {};
      },
    });
    try {
      await harness.installPlugins(
        instantiatePluginPackageDefinition(
          definition,
          {},
          { name: "@fixture/citations", version: "0.0.0" },
        ),
      );
      if (!sources) throw new Error("Missing installed source reader");
      expect(await sources.resolve([], signal)).toEqual([]);
      await harness.reset();
      expect(
        await sources.resolve([], signal).catch(caughtError),
      ).toBeInstanceOf(SdkError);
    } finally {
      await harness.reset();
    }
  });
});
