import { describe, expect, test } from "bun:test";
import { createSilentLogger } from "@brains/test-utils";
import { EntityRegistry } from "../src/entityRegistry";
import { minimalTestSchema, minimalTestAdapter } from "./helpers/test-schemas";

function registry(): EntityRegistry {
  const value = EntityRegistry.createFresh(createSilentLogger());
  value.registerEntityType("test", minimalTestSchema, minimalTestAdapter);
  return value;
}

describe("grouping source lifecycle", () => {
  test("does nothing without a source and skips its own entity reads", async () => {
    const value = registry();
    await value.ensureGroupingsCurrent();
    let calls = 0;
    value.registerGroupingSource({
      entityType: "test",
      ensureCurrent: async () => {
        calls++;
      },
    });
    await value.ensureGroupingsCurrent("test");
    expect(calls).toBe(0);
    await value.ensureGroupingsCurrent("note");
    await value.ensureGroupingsCurrent();
    expect(calls).toBe(2);
  });
  test("refuses unknown or competing sources without replacing the installed source", async () => {
    const value = registry();
    const source = {
      entityType: "unknown",
      ensureCurrent: async (): Promise<void> => {},
    };
    expect(() => value.registerGroupingSource(source)).toThrow(
      "not registered",
    );
    let calls = 0;
    value.registerGroupingSource({
      entityType: "test",
      ensureCurrent: async () => {
        calls++;
      },
    });
    expect(() => value.registerGroupingSource(source)).toThrow(
      "already registered",
    );
    await value.ensureGroupingsCurrent();
    expect(calls).toBe(1);
  });
  test("propagates refresh failure rather than using stale policy", async () => {
    const value = registry();
    value.registerGroupingSource({
      entityType: "test",
      ensureCurrent: async () => {
        throw new Error("Read unavailable");
      },
    });
    expect(
      await value.ensureGroupingsCurrent().catch((error: unknown) => error),
    ).toMatchObject({ message: "Read unavailable" });
  });
  test("unregistering the owner clears its source and grouping-owned fields", async () => {
    const value = registry();
    let calls = 0;
    value.registerGroupingSource({
      entityType: "test",
      ensureCurrent: async () => {
        calls++;
      },
    });
    value.replaceGroupings([
      { key: "areas", field: "areas", label: "Areas", types: ["test"] },
    ]);
    value.unregisterEntityType("test");
    await value.ensureGroupingsCurrent();
    expect(calls).toBe(0);
    expect(value.getGroupings()).toEqual([]);
    value.registerEntityType("test", minimalTestSchema, minimalTestAdapter);
    value.registerGroupingSource({
      entityType: "test",
      ensureCurrent: async () => {
        calls++;
      },
    });
    await value.ensureGroupingsCurrent();
    expect(calls).toBe(1);
  });
});
