import type { IMetricCollector } from "./types";
import type { TotalMetrics, TurnMetrics, ToolCallRecord } from "./schemas";

/**
 * Collects and aggregates metrics from agent responses
 */
export class MetricCollector implements IMetricCollector {
  private turnStartTime: number | null = null;
  private turnMetrics: TurnMetrics[] = [];
  private toolCalls: ToolCallRecord[][] = [];

  /**
   * Start timing a turn
   */
  startTurn(): void {
    this.turnStartTime = Date.now();
  }

  /**
   * End timing and record metrics from agent response
   */
  endTurn(response: {
    usage?: {
      promptTokens: number;
      completionTokens: number;
      totalTokens: number;
    };
    toolResults?: Array<{
      toolName: string;
      args?: Record<string, unknown>;
      result?: unknown;
    }>;
  }): TurnMetrics {
    const endTime = Date.now();
    const durationMs = this.turnStartTime ? endTime - this.turnStartTime : 0;

    const toolResults = response.toolResults ?? [];
    const toolCallRecords: ToolCallRecord[] = toolResults.map((tr) => ({
      toolName: tr.toolName,
      args: tr.args,
      result: tr.result,
    }));

    const metrics: TurnMetrics = {
      promptTokens: response.usage?.promptTokens ?? 0,
      completionTokens: response.usage?.completionTokens ?? 0,
      totalTokens: response.usage?.totalTokens ?? 0,
      toolCallCount: toolResults.length,
      durationMs,
    };

    this.turnMetrics.push(metrics);
    this.toolCalls.push(toolCallRecords);
    this.turnStartTime = null;

    return metrics;
  }

  /**
   * Get tool calls for a specific turn
   */
  getToolCallsForTurn(turnIndex: number): ToolCallRecord[] {
    return this.toolCalls[turnIndex] ?? [];
  }

  /**
   * Get all tool calls across all turns
   */
  getAllToolCalls(): ToolCallRecord[] {
    return this.toolCalls.flat();
  }

  /**
   * Get aggregated metrics across all turns
   */
  getTotalMetrics(): TotalMetrics {
    return {
      promptTokens: this.turnMetrics.reduce(
        (sum, m) => sum + m.promptTokens,
        0,
      ),
      completionTokens: this.turnMetrics.reduce(
        (sum, m) => sum + m.completionTokens,
        0,
      ),
      totalTokens: this.turnMetrics.reduce((sum, m) => sum + m.totalTokens, 0),
      toolCallCount: this.turnMetrics.reduce(
        (sum, m) => sum + m.toolCallCount,
        0,
      ),
      durationMs: this.turnMetrics.reduce((sum, m) => sum + m.durationMs, 0),
      turnCount: this.turnMetrics.length,
    };
  }

  /**
   * Reset the collector for a new test
   */
  reset(): void {
    this.turnStartTime = null;
    this.turnMetrics = [];
    this.toolCalls = [];
  }

  /**
   * Create a fresh instance
   */
  static createFresh(): MetricCollector {
    return new MetricCollector();
  }
}
