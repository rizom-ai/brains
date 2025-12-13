import { describe, it, expect, beforeEach } from "bun:test";

import { MetricCollector } from "../src/metric-collector";

describe("MetricCollector", () => {
  let collector: MetricCollector;

  beforeEach(() => {
    collector = MetricCollector.createFresh();
  });

  describe("startTurn/endTurn", () => {
    it("should track metrics for a single turn", () => {
      collector.startTurn();

      const metrics = collector.endTurn({
        usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
        toolResults: [{ toolName: "test_tool", args: { query: "test" } }],
      });

      expect(metrics.promptTokens).toBe(100);
      expect(metrics.completionTokens).toBe(50);
      expect(metrics.totalTokens).toBe(150);
      expect(metrics.toolCallCount).toBe(1);
      expect(metrics.durationMs).toBeGreaterThanOrEqual(0);
    });

    it("should handle missing usage gracefully", () => {
      collector.startTurn();

      const metrics = collector.endTurn({});

      expect(metrics.promptTokens).toBe(0);
      expect(metrics.completionTokens).toBe(0);
      expect(metrics.totalTokens).toBe(0);
      expect(metrics.toolCallCount).toBe(0);
    });
  });

  describe("getToolCallsForTurn", () => {
    it("should return tool calls for a specific turn", () => {
      collector.startTurn();
      collector.endTurn({
        toolResults: [{ toolName: "tool_a", args: { x: 1 } }],
      });

      collector.startTurn();
      collector.endTurn({
        toolResults: [{ toolName: "tool_b", args: { y: 2 } }],
      });

      const turn0Calls = collector.getToolCallsForTurn(0);
      const turn1Calls = collector.getToolCallsForTurn(1);

      expect(turn0Calls).toHaveLength(1);
      expect(turn0Calls[0]?.toolName).toBe("tool_a");

      expect(turn1Calls).toHaveLength(1);
      expect(turn1Calls[0]?.toolName).toBe("tool_b");
    });

    it("should return empty array for invalid turn index", () => {
      const calls = collector.getToolCallsForTurn(999);
      expect(calls).toEqual([]);
    });
  });

  describe("getAllToolCalls", () => {
    it("should return all tool calls across turns", () => {
      collector.startTurn();
      collector.endTurn({
        toolResults: [{ toolName: "tool_a" }],
      });

      collector.startTurn();
      collector.endTurn({
        toolResults: [{ toolName: "tool_b" }, { toolName: "tool_c" }],
      });

      const allCalls = collector.getAllToolCalls();
      expect(allCalls).toHaveLength(3);
      expect(allCalls.map((c) => c.toolName)).toEqual([
        "tool_a",
        "tool_b",
        "tool_c",
      ]);
    });
  });

  describe("getTotalMetrics", () => {
    it("should aggregate metrics across multiple turns", () => {
      collector.startTurn();
      collector.endTurn({
        usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
        toolResults: [{ toolName: "tool_a" }],
      });

      collector.startTurn();
      collector.endTurn({
        usage: { promptTokens: 200, completionTokens: 100, totalTokens: 300 },
        toolResults: [{ toolName: "tool_b" }, { toolName: "tool_c" }],
      });

      const total = collector.getTotalMetrics();

      expect(total.promptTokens).toBe(300);
      expect(total.completionTokens).toBe(150);
      expect(total.totalTokens).toBe(450);
      expect(total.toolCallCount).toBe(3);
      expect(total.turnCount).toBe(2);
    });
  });

  describe("reset", () => {
    it("should clear all collected metrics", () => {
      collector.startTurn();
      collector.endTurn({
        usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
      });

      collector.reset();

      const total = collector.getTotalMetrics();
      expect(total.promptTokens).toBe(0);
      expect(total.turnCount).toBe(0);
      expect(collector.getAllToolCalls()).toEqual([]);
    });
  });
});
