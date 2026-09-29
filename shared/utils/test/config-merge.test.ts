import { describe, expect, it } from "bun:test";
import { deepMerge } from "../src/config-merge";

describe("configuration merge", () => {
  it("merges nested maps, replaces lists and preserves explicit false", () => {
    const base = {
      plugin: { nested: { keep: 1, replace: 2 }, list: [1, 2], enabled: true },
    };
    const override = {
      plugin: { nested: { replace: 3 }, list: [3], enabled: false },
    };
    expect(deepMerge(base, override)).toEqual({
      plugin: {
        nested: { keep: 1, replace: 3 },
        list: [3],
        enabled: false,
      },
    });
    expect(base).toEqual({
      plugin: { nested: { keep: 1, replace: 2 }, list: [1, 2], enabled: true },
    });
    expect(override).toEqual({
      plugin: { nested: { replace: 3 }, list: [3], enabled: false },
    });
  });

  it("preserves deletion markers during composition and consumes them at runtime", () => {
    const defaults = {
      plugin: { generated: "keep", remove: "generated value" },
    };
    const authored = {
      plugin: {
        remove: null,
        runtimeOnly: null,
        list: ["replacement"],
        enabled: false,
      },
    };
    const composed = deepMerge(defaults, authored, { nulls: "preserve" });
    expect(composed).toEqual({
      plugin: {
        generated: "keep",
        remove: null,
        runtimeOnly: null,
        list: ["replacement"],
        enabled: false,
      },
    });
    expect(
      deepMerge(
        { plugin: { runtimeOnly: true, runtimeSibling: 42, list: ["old"] } },
        composed,
      ),
    ).toEqual({
      plugin: {
        generated: "keep",
        runtimeSibling: 42,
        list: ["replacement"],
        enabled: false,
      },
    });
    expect(defaults).toEqual({
      plugin: { generated: "keep", remove: "generated value" },
    });
    expect(authored.plugin.remove).toBeNull();
  });

  it("retains the app's null-as-deletion semantics", () => {
    expect(
      deepMerge(
        { keep: 1, remove: 2, nested: { keep: false, remove: 3 } },
        {
          remove: null,
          nested: { remove: null },
          missing: null,
        },
      ),
    ).toEqual({ keep: 1, nested: { keep: false } });
  });
});
