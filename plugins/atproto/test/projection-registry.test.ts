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

describe("AtprotoProjectionRegistry", () => {
  it("registers and returns projections by entity type", () => {
    const registry = AtprotoProjectionRegistry.createFresh();
    const projection = {
      entityType: "post",
      collection: "ai.rizom.brain.post",
      lexicon: createLexicon("ai.rizom.brain.post"),
      validate: false,
      buildRecord: (): Promise<AtprotoProjectedPostRecord> =>
        Promise.resolve(createPostRecord()),
    };

    registry.register(projection);

    expect(registry.get("post")).toBe(projection);
    expect(registry.has("post")).toBe(true);
    expect(registry.list()).toEqual([projection]);
  });

  it("lists registered lexicons", () => {
    const registry = AtprotoProjectionRegistry.createFresh();
    const lexicon = createLexicon("ai.rizom.brain.post");
    registry.register({
      entityType: "post",
      collection: "ai.rizom.brain.post",
      lexicon,
      buildRecord: (): Promise<AtprotoProjectedPostRecord> =>
        Promise.resolve(createPostRecord()),
    });

    expect(registry.listLexicons()).toEqual([lexicon]);
  });

  it("rejects collection and lexicon id mismatches", () => {
    const registry = AtprotoProjectionRegistry.createFresh();

    expect(() =>
      registry.register({
        entityType: "post",
        collection: "ai.rizom.brain.post",
        lexicon: createLexicon("ai.rizom.brain.note"),
        buildRecord: (): Promise<AtprotoProjectedPostRecord> =>
          Promise.resolve(createPostRecord()),
      }),
    ).toThrow("collection must match lexicon id");
  });

  it("allows idempotent re-registration of the same projection", () => {
    const registry = AtprotoProjectionRegistry.createFresh();
    const projection = {
      entityType: "post",
      collection: "ai.rizom.brain.post",
      lexicon: createLexicon("ai.rizom.brain.post"),
      buildRecord: (): Promise<AtprotoProjectedPostRecord> =>
        Promise.resolve(createPostRecord()),
    };

    registry.register(projection);
    registry.register(projection);

    expect(registry.get("post")).toBe(projection);
    expect(registry.list()).toEqual([projection]);
  });

  it("uses the newest implementation for equivalent registrations", () => {
    const registry = AtprotoProjectionRegistry.createFresh();
    const first = {
      entityType: "post",
      collection: "ai.rizom.brain.post",
      lexicon: createLexicon("ai.rizom.brain.post"),
      buildRecord: (): Promise<AtprotoProjectedPostRecord> =>
        Promise.resolve(createPostRecord({ instance: "first" })),
    };
    const second = {
      entityType: "post",
      collection: "ai.rizom.brain.post",
      lexicon: createLexicon("ai.rizom.brain.post"),
      buildRecord: (): Promise<AtprotoProjectedPostRecord> =>
        Promise.resolve(createPostRecord({ instance: "second" })),
    };

    const unregisterFirst = registry.register(first);
    const unregisterSecond = registry.register(second);

    expect(registry.get("post")).toBe(second);
    expect(registry.list()).toEqual([second]);
    unregisterSecond();
    expect(registry.get("post")).toBe(first);
    unregisterFirst();
    expect(registry.get("post")).toBeUndefined();
  });

  it("restores the newest remaining instance when an older one unregisters", () => {
    const registry = AtprotoProjectionRegistry.createFresh();
    const first = {
      entityType: "post",
      collection: "ai.rizom.brain.post",
      lexicon: createLexicon("ai.rizom.brain.post"),
      buildRecord: (): Promise<AtprotoProjectedPostRecord> =>
        Promise.resolve(createPostRecord({ instance: "first" })),
    };
    const second = {
      entityType: "post",
      collection: "ai.rizom.brain.post",
      lexicon: createLexicon("ai.rizom.brain.post"),
      buildRecord: (): Promise<AtprotoProjectedPostRecord> =>
        Promise.resolve(createPostRecord({ instance: "second" })),
    };

    const unregisterFirst = registry.register(first);
    registry.register(second);

    unregisterFirst();
    expect(registry.get("post")).toBe(second);
  });

  it("rejects conflicting registrations for the same entity type", () => {
    const registry = AtprotoProjectionRegistry.createFresh();
    const first = {
      entityType: "post",
      collection: "ai.rizom.brain.post",
      lexicon: createLexicon("ai.rizom.brain.post"),
      buildRecord: (): Promise<AtprotoProjectedPostRecord> =>
        Promise.resolve(createPostRecord({ version: 1 })),
    };
    const second = {
      entityType: "post",
      collection: "ai.rizom.brain.post.v2",
      lexicon: createLexicon("ai.rizom.brain.post.v2"),
      buildRecord: (): Promise<AtprotoProjectedPostRecord> =>
        Promise.resolve(createPostRecord({ version: 2 })),
    };

    registry.register(first);

    expect(() => registry.register(second)).toThrow(
      "AT Protocol projection already registered for entity type post",
    );
    expect(registry.get("post")).toBe(first);
  });

  it("unregisters projections", () => {
    const registry = AtprotoProjectionRegistry.createFresh();
    const unregister = registry.register({
      entityType: "post",
      collection: "ai.rizom.brain.post",
      lexicon: createLexicon("ai.rizom.brain.post"),
      buildRecord: (): Promise<AtprotoProjectedPostRecord> =>
        Promise.resolve(createPostRecord()),
    });

    unregister();

    expect(registry.has("post")).toBe(false);
    expect(registry.get("post")).toBeUndefined();
  });
});
