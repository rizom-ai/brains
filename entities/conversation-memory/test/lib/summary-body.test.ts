import { describe, it, expect } from "bun:test";
import {
  composeSummaryBody,
  parseSummaryBody,
} from "../../src/lib/summary-body";
import type { SummaryEntry } from "../../src/schemas/summary";

const entry: SummaryEntry = {
  title: "Architecture Direction",
  summary: "The team agreed to derive summaries from stored messages.",
  timeRange: {
    start: "2026-01-01T00:00:00.000Z",
    end: "2026-01-01T00:10:00.000Z",
  },
  sourceMessageCount: 3,
  keyPoints: ["Digest events are not source of truth"],
};

describe("summary body format", () => {
  it("creates markdown content for time-based entries", () => {
    const content = composeSummaryBody([entry]);

    expect(content).toContain("# Conversation Summary");
    expect(content).toContain("## Architecture Direction");
    expect(content).toContain(
      "Time: 2026-01-01T00:00:00.000Z → 2026-01-01T00:10:00.000Z",
    );
    expect(content).toContain("Messages summarized: 3");
    expect(content).not.toContain("### Decisions");
    expect(content).not.toContain("### Action Items");
  });

  it("parses entries from markdown", () => {
    const content = composeSummaryBody([entry]);
    const parsed = parseSummaryBody(content);

    expect(parsed.entries).toHaveLength(1);
    expect(parsed.entries[0]).toEqual(entry);
  });
});
