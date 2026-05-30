import { describe, expect, it } from "bun:test";
import {
  AtprotoProjectionRegistry,
  type AtprotoProjectedPostRecord,
} from "../src";

function createPostRecord(
  input: Partial<AtprotoProjectedPostRecord> = {},
): AtprotoProjectedPostRecord {
  return {
    title: "Post",
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
      validate: false,
      buildRecord: (): Promise<AtprotoProjectedPostRecord> =>
        Promise.resolve(createPostRecord()),
    };

    registry.register(projection);

    expect(registry.get("post")).toBe(projection);
    expect(registry.has("post")).toBe(true);
    expect(registry.list()).toEqual([projection]);
  });

  it("replaces registrations for the same entity type", () => {
    const registry = AtprotoProjectionRegistry.createFresh();
    const first = {
      entityType: "post",
      collection: "ai.rizom.brain.post",
      buildRecord: (): Promise<AtprotoProjectedPostRecord> =>
        Promise.resolve(createPostRecord({ version: 1 })),
    };
    const second = {
      entityType: "post",
      collection: "ai.rizom.brain.post.v2",
      buildRecord: (): Promise<AtprotoProjectedPostRecord> =>
        Promise.resolve(createPostRecord({ version: 2 })),
    };

    registry.register(first);
    registry.register(second);

    expect(registry.get("post")).toBe(second);
    expect(registry.list()).toEqual([second]);
  });

  it("unregisters projections", () => {
    const registry = AtprotoProjectionRegistry.createFresh();
    const unregister = registry.register({
      entityType: "post",
      collection: "ai.rizom.brain.post",
      buildRecord: (): Promise<AtprotoProjectedPostRecord> =>
        Promise.resolve(createPostRecord()),
    });

    unregister();

    expect(registry.has("post")).toBe(false);
    expect(registry.get("post")).toBeUndefined();
  });
});
