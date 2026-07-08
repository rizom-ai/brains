import { describe, expect, it } from "bun:test";
import {
  AtprotoProjectionRegistry,
  type AtprotoLexicon,
  type AtprotoProjectedPostRecord,
} from "../src";

function createLexicon(id: string): AtprotoLexicon {
  return {
    lexicon: 1,
    id,
    defs: {
      main: {
        type: "record",
        key: "tid",
        record: {
          type: "object",
          required: ["title", "createdAt"],
          properties: {
            title: { type: "string" },
            createdAt: { type: "string", format: "datetime" },
          },
        },
      },
    },
  };
}

function createPostRecord(
  input: Record<string, unknown> = {},
): AtprotoProjectedPostRecord {
  return {
    title: "Post",
    body: "Post body",
    sourceEntityType: "post",
    sourceEntityId: "post-1",
    createdAt: "2026-05-28T10:00:00.000Z",
    ...input,
  };
}

function createProjection(instance: string): {
  entityType: string;
  collection: string;
  lexicon: AtprotoLexicon;
  buildRecord: () => Promise<AtprotoProjectedPostRecord>;
} {
  return {
    entityType: "post",
    collection: "ai.rizom.brain.post",
    lexicon: createLexicon("ai.rizom.brain.post"),
    buildRecord: (): Promise<AtprotoProjectedPostRecord> =>
      Promise.resolve(createPostRecord({ instance })),
  };
}

describe("AtprotoProjectionRegistry", () => {
  it("uses the newest implementation for equivalent registrations", () => {
    const registry = AtprotoProjectionRegistry.createFresh();
    const first = createProjection("first");
    const second = createProjection("second");

    const unregisterFirst = registry.register(first);
    const unregisterSecond = registry.register(second);

    expect(registry.get("post")).toBe(second);
    expect(registry.list()).toEqual([second]);
    unregisterSecond();
    expect(registry.get("post")).toBe(first);
    unregisterFirst();
    expect(registry.get("post")).toBeUndefined();
    expect(registry.has("post")).toBe(false);
  });

  it("restores the newest remaining instance when an older one unregisters", () => {
    const registry = AtprotoProjectionRegistry.createFresh();
    const first = createProjection("first");
    const second = createProjection("second");

    const unregisterFirst = registry.register(first);
    registry.register(second);

    unregisterFirst();
    expect(registry.get("post")).toBe(second);
  });

  it("allows idempotent re-registration of the same projection object", () => {
    const registry = AtprotoProjectionRegistry.createFresh();
    const projection = createProjection("only");

    const unregisterFirst = registry.register(projection);
    const unregisterSecond = registry.register(projection);

    expect(registry.get("post")).toBe(projection);
    expect(registry.list()).toEqual([projection]);
    unregisterFirst();
    expect(registry.get("post")).toBe(projection);
    unregisterSecond();
    expect(registry.get("post")).toBeUndefined();
  });

  it("rejects conflicting registrations for the same entity type", () => {
    const registry = AtprotoProjectionRegistry.createFresh();
    const first = createProjection("first");
    const second = {
      entityType: "post",
      collection: "ai.rizom.brain.post.v2",
      lexicon: createLexicon("ai.rizom.brain.post.v2"),
      buildRecord: (): Promise<AtprotoProjectedPostRecord> =>
        Promise.resolve(createPostRecord()),
    };

    registry.register(first);

    expect(() => registry.register(second)).toThrow(
      "AT Protocol projection already registered for entity type post",
    );
    expect(registry.get("post")).toBe(first);
  });

  it("ignores double calls of the same unregister function", () => {
    const registry = AtprotoProjectionRegistry.createFresh();
    const first = createProjection("first");
    const second = createProjection("second");

    const unregisterFirst = registry.register(first);
    registry.register(second);

    unregisterFirst();
    unregisterFirst();
    expect(registry.get("post")).toBe(second);
  });
});
