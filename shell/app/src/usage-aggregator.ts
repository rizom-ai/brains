/**
 * Parse ai:usage events from a structured log file and aggregate them.
 *
 * The Logger writes JSON lines like:
 *   {"ts":"...","level":"info","ctx":"AIService","msg":"ai:usage","data":[{...}]}
 *
 * This module parses those lines, filters for ai:usage events, and returns
 * aggregated statistics.
 */

export interface UsageEntry {
  operation: string;
  provider: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
}

export interface UsageEvent {
  ts: string;
  data: UsageEntry;
}

export interface ModelAggregate {
  calls: number;
  inputTokens: number;
  outputTokens: number;
}

export interface UsageReport {
  events: UsageEvent[];
  firstTs: string;
  lastTs: string;
  totalInputTokens: number;
  totalOutputTokens: number;
  byModel: Map<string, ModelAggregate>;
}

/**
 * Parse a single log line. Returns null if it's not a valid ai:usage event.
 */
export function parseUsageLine(line: string): UsageEvent | null {
  try {
    const parsed = JSON.parse(line) as Record<string, unknown>;
    if (parsed["msg"] !== "ai:usage") return null;
    const data = parsed["data"];
    if (!Array.isArray(data) || data.length === 0) return null;
    const first = data[0];
    if (!isUsageEntry(first)) return null;
    return { ts: String(parsed["ts"] ?? ""), data: first };
  } catch {
    return null;
  }
}

function isUsageEntry(value: unknown): value is UsageEntry {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v["operation"] === "string" &&
    typeof v["provider"] === "string" &&
    typeof v["model"] === "string" &&
    typeof v["inputTokens"] === "number" &&
    typeof v["outputTokens"] === "number"
  );
}

/**
 * Parse an entire log file and return an aggregated usage report.
 */
export function aggregateUsage(logContent: string): UsageReport {
  const events: UsageEvent[] = [];
  for (const line of logContent.trim().split("\n")) {
    const event = parseUsageLine(line);
    if (event) events.push(event);
  }

  const byModel = new Map<string, ModelAggregate>();
  let totalInputTokens = 0;
  let totalOutputTokens = 0;

  for (const { data } of events) {
    const key = `${data.provider}/${data.model}`;
    const agg = byModel.get(key) ?? {
      calls: 0,
      inputTokens: 0,
      outputTokens: 0,
    };
    agg.calls++;
    agg.inputTokens += data.inputTokens;
    agg.outputTokens += data.outputTokens;
    byModel.set(key, agg);
    totalInputTokens += data.inputTokens;
    totalOutputTokens += data.outputTokens;
  }

  return {
    events,
    firstTs: events[0]?.ts ?? "",
    lastTs: events[events.length - 1]?.ts ?? "",
    totalInputTokens,
    totalOutputTokens,
    byModel,
  };
}
