import { describe, expect, it } from "bun:test";
import { compileFilter, matchesFilter } from "@/filter-matcher";
import type { MessageWithPayload, SubscriptionFilter } from "@/types";

function makeMessage(
  overrides: Partial<MessageWithPayload> = {},
): MessageWithPayload {
  return {
    id: "msg-1",
    timestamp: "2026-01-01T00:00:00.000Z",
    type: "test",
    source: "plugin:alpha",
    payload: { hello: "world" },
    ...overrides,
  };
}

describe("compileFilter", () => {
  it("leaves source/target undefined when not provided", () => {
    const compiled = compileFilter({});
    expect(compiled.source).toBeUndefined();
    expect(compiled.target).toBeUndefined();
  });

  it("leaves a literal string (no wildcard) unchanged", () => {
    const compiled = compileFilter({ source: "plugin:alpha" });
    expect(compiled.source).toBe("plugin:alpha");
  });

  it("passes a RegExp through unchanged", () => {
    const re = /^plugin:.+$/;
    const compiled = compileFilter({ source: re });
    expect(compiled.source).toBe(re);
  });

  it("compiles a wildcard string into an anchored RegExp", () => {
    const compiled = compileFilter({ source: "plugin:*" });
    expect(compiled.source).toBeInstanceOf(RegExp);
    const re = compiled.source as RegExp;
    expect(re.test("plugin:alpha")).toBe(true);
    expect(re.test("plugin:")).toBe(true);
    expect(re.test("other:alpha")).toBe(false);
    expect(re.test("xplugin:alpha")).toBe(false);
  });

  it("escapes regex metacharacters in literal portions of a wildcard pattern", () => {
    const compiled = compileFilter({ source: "ns.*+name" });
    const re = compiled.source as RegExp;
    expect(re).toBeInstanceOf(RegExp);
    expect(re.test("ns.anything+name")).toBe(true);
    expect(re.test("nsX+name")).toBe(false);
    expect(re.test("ns.+name")).toBe(true);
  });

  it("compiles wildcard patterns on both source and target independently", () => {
    const compiled = compileFilter({ source: "a:*", target: "b:*" });
    expect(compiled.source).toBeInstanceOf(RegExp);
    expect(compiled.target).toBeInstanceOf(RegExp);
  });

  it("is idempotent for already-compiled RegExp inputs", () => {
    const once = compileFilter({ source: "plugin:*" });
    const twice = compileFilter(once);
    expect(twice.source).toBe(once.source);
  });

  it("preserves metadata and predicate fields", () => {
    const predicate = (): boolean => true;
    const filter: SubscriptionFilter = {
      source: "plugin:alpha",
      metadata: { region: "eu" },
      predicate,
    };
    const compiled = compileFilter(filter);
    expect(compiled.metadata).toEqual({ region: "eu" });
    expect(compiled.predicate).toBe(predicate);
  });
});

describe("matchesFilter", () => {
  it("returns true when no filter is supplied", () => {
    expect(matchesFilter(makeMessage())).toBe(true);
  });

  describe("source matching", () => {
    it("matches a literal source", () => {
      expect(matchesFilter(makeMessage(), { source: "plugin:alpha" })).toBe(
        true,
      );
    });

    it("rejects a literal source mismatch", () => {
      expect(matchesFilter(makeMessage(), { source: "plugin:beta" })).toBe(
        false,
      );
    });

    it("matches a compiled wildcard source", () => {
      const filter = compileFilter({ source: "plugin:*" });
      expect(matchesFilter(makeMessage(), filter)).toBe(true);
    });

    it("rejects a compiled wildcard source that does not match", () => {
      const filter = compileFilter({ source: "other:*" });
      expect(matchesFilter(makeMessage(), filter)).toBe(false);
    });

    it("rejects a message whose source is undefined when source filter is set", () => {
      const message = makeMessage({ source: undefined as unknown as string });
      expect(matchesFilter(message, { source: "plugin:alpha" })).toBe(false);
    });
  });

  describe("target matching", () => {
    it("matches when both message and filter targets agree", () => {
      const message = makeMessage({ target: "plugin:beta" });
      expect(matchesFilter(message, { target: "plugin:beta" })).toBe(true);
    });

    it("rejects when the message has no target but the filter requires one", () => {
      expect(matchesFilter(makeMessage(), { target: "plugin:beta" })).toBe(
        false,
      );
    });

    it("ignores target when the filter does not specify one", () => {
      const message = makeMessage({ target: "plugin:beta" });
      expect(matchesFilter(message, { source: "plugin:alpha" })).toBe(true);
    });
  });

  describe("metadata matching", () => {
    it("matches when every filter key equals the message metadata", () => {
      const message = makeMessage({ metadata: { region: "eu", tier: "pro" } });
      expect(matchesFilter(message, { metadata: { region: "eu" } })).toBe(true);
    });

    it("requires all filter metadata entries to match", () => {
      const message = makeMessage({ metadata: { region: "eu" } });
      expect(
        matchesFilter(message, { metadata: { region: "eu", tier: "pro" } }),
      ).toBe(false);
    });

    it("rejects when the message has no metadata but the filter does", () => {
      expect(matchesFilter(makeMessage(), { metadata: { region: "eu" } })).toBe(
        false,
      );
    });

    it("uses strict equality, not deep equality", () => {
      const message = makeMessage({ metadata: { tags: ["a"] } });
      expect(matchesFilter(message, { metadata: { tags: ["a"] } })).toBe(false);
    });
  });

  describe("predicate", () => {
    it("calls the predicate after structural checks pass", () => {
      const message = makeMessage();
      const seen: MessageWithPayload[] = [];
      const predicate = (m: MessageWithPayload): boolean => {
        seen.push(m);
        return true;
      };
      expect(matchesFilter(message, { predicate })).toBe(true);
      expect(seen).toEqual([message]);
    });

    it("rejects when the predicate returns false", () => {
      expect(matchesFilter(makeMessage(), { predicate: () => false })).toBe(
        false,
      );
    });

    it("does not invoke the predicate when an earlier check fails", () => {
      let called = false;
      const predicate = (): boolean => {
        called = true;
        return true;
      };
      matchesFilter(makeMessage(), { source: "no-match", predicate });
      expect(called).toBe(false);
    });
  });

  it("requires every filter dimension to match when combined", () => {
    const message = makeMessage({
      target: "plugin:beta",
      metadata: { region: "eu" },
    });
    const filter = compileFilter({
      source: "plugin:*",
      target: "plugin:beta",
      metadata: { region: "eu" },
      predicate: (m): boolean => m.id === "msg-1",
    });
    expect(matchesFilter(message, filter)).toBe(true);

    const wrongMetadata = compileFilter({
      ...filter,
      metadata: { region: "us" },
    });
    expect(matchesFilter(message, wrongMetadata)).toBe(false);
  });
});
