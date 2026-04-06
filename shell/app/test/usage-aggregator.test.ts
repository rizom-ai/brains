import { describe, test, expect } from "bun:test";
import { parseUsageLine, aggregateUsage } from "../src/usage-aggregator";

describe("parseUsageLine", () => {
  test("parses valid ai:usage event", () => {
    const line = JSON.stringify({
      ts: "2026-04-05T10:00:00Z",
      level: "info",
      ctx: "AIService",
      msg: "ai:usage",
      data: [
        {
          operation: "text_generation",
          provider: "openai",
          model: "gpt-4.1",
          inputTokens: 100,
          outputTokens: 50,
        },
      ],
    });

    const result = parseUsageLine(line);
    expect(result).not.toBeNull();
    expect(result?.ts).toBe("2026-04-05T10:00:00Z");
    expect(result?.data.operation).toBe("text_generation");
    expect(result?.data.inputTokens).toBe(100);
  });

  test("returns null for non-usage log entries", () => {
    const line = JSON.stringify({
      ts: "2026-04-05T10:00:00Z",
      level: "info",
      msg: "Some other message",
    });
    expect(parseUsageLine(line)).toBeNull();
  });

  test("returns null for malformed JSON", () => {
    expect(parseUsageLine("not json")).toBeNull();
    expect(parseUsageLine("")).toBeNull();
    expect(parseUsageLine("{incomplete")).toBeNull();
  });

  test("returns null for ai:usage with missing data", () => {
    const line = JSON.stringify({
      ts: "2026-04-05T10:00:00Z",
      msg: "ai:usage",
      data: [],
    });
    expect(parseUsageLine(line)).toBeNull();
  });

  test("returns null for invalid usage entry shape", () => {
    const line = JSON.stringify({
      ts: "2026-04-05T10:00:00Z",
      msg: "ai:usage",
      data: [{ operation: "text_generation" }], // missing fields
    });
    expect(parseUsageLine(line)).toBeNull();
  });
});

describe("aggregateUsage", () => {
  const makeEntry = (
    ts: string,
    provider: string,
    model: string,
    inputTokens: number,
    outputTokens: number,
  ): string =>
    JSON.stringify({
      ts,
      level: "info",
      msg: "ai:usage",
      data: [
        {
          operation: "text_generation",
          provider,
          model,
          inputTokens,
          outputTokens,
        },
      ],
    });

  test("aggregates multiple events by model", () => {
    const log = [
      makeEntry("2026-04-05T10:00:00Z", "openai", "gpt-4.1", 100, 50),
      makeEntry("2026-04-05T10:01:00Z", "openai", "gpt-4.1", 200, 100),
      makeEntry(
        "2026-04-05T10:02:00Z",
        "openai",
        "text-embedding-3-small",
        42,
        0,
      ),
    ].join("\n");

    const report = aggregateUsage(log);

    expect(report.events).toHaveLength(3);
    expect(report.totalInputTokens).toBe(342);
    expect(report.totalOutputTokens).toBe(150);

    const gpt = report.byModel.get("openai/gpt-4.1");
    expect(gpt).toBeDefined();
    expect(gpt?.calls).toBe(2);
    expect(gpt?.inputTokens).toBe(300);
    expect(gpt?.outputTokens).toBe(150);

    const embedding = report.byModel.get("openai/text-embedding-3-small");
    expect(embedding).toBeDefined();
    expect(embedding?.calls).toBe(1);
    expect(embedding?.inputTokens).toBe(42);
  });

  test("handles empty log", () => {
    const report = aggregateUsage("");
    expect(report.events).toHaveLength(0);
    expect(report.totalInputTokens).toBe(0);
    expect(report.byModel.size).toBe(0);
    expect(report.firstTs).toBe("");
    expect(report.lastTs).toBe("");
  });

  test("ignores non-usage log lines", () => {
    const log = [
      JSON.stringify({ ts: "2026-04-05T10:00:00Z", msg: "boot complete" }),
      makeEntry("2026-04-05T10:01:00Z", "openai", "gpt-4.1", 100, 50),
      JSON.stringify({ ts: "2026-04-05T10:02:00Z", msg: "sync complete" }),
      "not json at all",
    ].join("\n");

    const report = aggregateUsage(log);
    expect(report.events).toHaveLength(1);
    expect(report.totalInputTokens).toBe(100);
  });

  test("records first and last timestamps", () => {
    const log = [
      makeEntry("2026-04-05T10:00:00Z", "openai", "gpt-4.1", 10, 5),
      makeEntry("2026-04-05T11:00:00Z", "openai", "gpt-4.1", 20, 10),
      makeEntry("2026-04-05T12:00:00Z", "openai", "gpt-4.1", 30, 15),
    ].join("\n");

    const report = aggregateUsage(log);
    expect(report.firstTs).toBe("2026-04-05T10:00:00Z");
    expect(report.lastTs).toBe("2026-04-05T12:00:00Z");
  });

  test("groups different providers separately", () => {
    const log = [
      makeEntry("2026-04-05T10:00:00Z", "openai", "gpt-4.1", 100, 50),
      makeEntry(
        "2026-04-05T10:01:00Z",
        "anthropic",
        "claude-sonnet-4-5",
        200,
        100,
      ),
    ].join("\n");

    const report = aggregateUsage(log);
    expect(report.byModel.size).toBe(2);
    expect(report.byModel.has("openai/gpt-4.1")).toBe(true);
    expect(report.byModel.has("anthropic/claude-sonnet-4-5")).toBe(true);
  });
});
