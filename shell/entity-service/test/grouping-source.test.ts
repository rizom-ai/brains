import { describe, expect, test } from "bun:test";
import { throws } from "node:assert/strict";
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
  test("an installed source refuses later static declarations but can publish replacements", () => {
    const value = registry();
    value.registerGroupingSource({
      entityType: "test",
      ensureCurrent: async (): Promise<void> => {},
    });
    const grouping = {
      key: "areas",
      field: "areas",
      label: "Areas",
      types: ["test"],
    };
    expect(() => value.registerGrouping(grouping)).toThrow(
      "owned by a registered source",
    );
    expect(value.getGroupings()).toEqual([]);
    value.replaceGroupings([grouping]);
    expect(value.getGroupings()).toEqual([grouping]);
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
  test("write guards change only on successful publication, including an unchanged pair set", () => {
    const value = registry();
    const grouping = {
      key: "areas",
      field: "areas",
      label: "Areas",
      types: ["test"],
    };
    value.replaceGroupings([grouping]);
    const before = value.captureGroupingWriteGuard("test");
    expect(() =>
      value.replaceGroupings([{ ...grouping, types: ["missing"] }]),
    ).toThrow();
    before();
    // A source can publish a policy edit without changing its field declarations.
    value.replaceGroupings([grouping]);
    throws(before, {
      name: "EntityValidationError",
      phase: "persist",
    });
    value.captureGroupingWriteGuard("test")();
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
