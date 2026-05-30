import { describe, expect, it } from "bun:test";
import { AtprotoProjectionRegistry } from "../src";

describe("AtprotoProjectionRegistry", () => {
  it("registers and returns projections by entity type", () => {
    const registry = AtprotoProjectionRegistry.createFresh();
    const projection = {
      entityType: "post",
      collection: "ai.rizom.brain.post",
      validate: false,
      buildRecord: (): Promise<Record<string, unknown>> =>
        Promise.resolve({
          $type: "ai.rizom.brain.post",
          title: "Post",
        }),
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
      buildRecord: (): Promise<Record<string, unknown>> =>
        Promise.resolve({ version: 1 }),
    };
    const second = {
      entityType: "post",
      collection: "ai.rizom.brain.post.v2",
      buildRecord: (): Promise<Record<string, unknown>> =>
        Promise.resolve({ version: 2 }),
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
      buildRecord: (): Promise<Record<string, unknown>> => Promise.resolve({}),
    });

    unregister();

    expect(registry.has("post")).toBe(false);
    expect(registry.get("post")).toBeUndefined();
  });
});
