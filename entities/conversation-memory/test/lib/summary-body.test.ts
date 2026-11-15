import { describe, it, expect } from "bun:test";
import { expectBodyRoundTrip } from "@brains/test-utils";
import { z } from "@brains/utils/zod";
import {
  composeSummaryBody,
  parseSummaryBody,
  summaryBodyCodec,
} from "../../src/lib/summary-body";
import { summary } from "../../src/summary-entity";
import type { SummaryBody, SummaryEntry } from "../../src/schemas/summary";
import { defaultSummaryMetadata } from "../fixtures/summary-entities";
import { typeAdapter } from "../conversation-memory-plugins";

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

/** A summary written as the declared type writes it. */
function written(content: string): unknown {
  const encode = summary.markdown?.encode;
  if (!encode) throw new Error("The summary type declares no writer");
  return encode({ content, metadata: defaultSummaryMetadata });
}

describe("the summary type", () => {
  it("describes projected summaries as read-only system memory", () => {
    expect(summary.purpose).toBe(
      "A read-only, system-maintained summary derived from stored conversation messages.",
    );
  });

  it("names a summary by where and when its conversation happened", async () => {
    const adapter = await typeAdapter("summary");
    const stored = {
      id: "test-conv",
      entityType: "summary",
      content: "",
      contentHash: "hash",
      visibility: "restricted" as const,
      created: "2026-03-04T05:06:07.000Z",
      updated: "2026-03-04T05:06:07.000Z",
    };
    expect(
      adapter.displayTitle?.({ ...stored, metadata: defaultSummaryMetadata }),
    ).toBe("Test Channel · 2026-01-01");
    const { timeRange: _timeRange, ...withoutRange } = defaultSummaryMetadata;
    // One that records no start is named by the day it was stored.
    expect(adapter.displayTitle?.({ ...stored, metadata: withoutRange })).toBe(
      "Test Channel · 2026-03-04",
    );
  });

  it("writes the body from its entries and its metadata as frontmatter", () => {
    const body = composeSummaryBody([entry]);

    expect(written(body)).toEqual({
      content: body,
      frontmatter: defaultSummaryMetadata,
    });
  });
});

describe("a summary body", () => {
  it("is written for time-based entries", () => {
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

  it("parses entries from markdown, with or without its header", () => {
    const content = composeSummaryBody([entry]);

    expect(parseSummaryBody(content).entries).toEqual([entry]);
    expect(
      parseSummaryBody(`---\nchannelId: test-channel\n---\n${content}`).entries,
    ).toEqual([entry]);
  });
});

describe("the summary body codec", () => {
  const formatter = {
    format: (body: SummaryBody): string => z.encode(summaryBodyCodec, body),
    parse: (markdown: string): SummaryBody =>
      z.decode(summaryBodyCodec, markdown),
  };

  it("round-trips summary entries", () => {
    expectBodyRoundTrip(formatter, {
      entries: [entry, { ...entry, title: "Next Steps", keyPoints: [] }],
    });
  });

  it("rejects invalid stored entries rather than dropping them on write", () => {
    const body = composeSummaryBody([
      entry,
      { ...entry, title: "Next Steps" },
    ]).replace("Time: 2026-01-01T00:00:00.000Z", "Time: yesterday");

    expect(() => parseSummaryBody(body)).toThrow(z.ZodError);
    expect(() => written(body)).toThrow(z.ZodError);
    expect(body).toContain("Time: yesterday");
    expect(body).toContain("Next Steps");
  });

  it.each([
    [
      "missing time",
      "Time: 2026-01-01T00:00:00.000Z → 2026-01-01T00:10:00.000Z",
      "",
    ],
    ["negative count", "Messages summarized: 3", "Messages summarized: -1"],
    ["fractional count", "Messages summarized: 3", "Messages summarized: 1.5"],
    ["missing count", "Messages summarized: 3", ""],
    ["missing prose", entry.summary, ""],
  ])(
    "does not silently discard an entry with %s",
    (_label, oldText, newText) => {
      const body = composeSummaryBody([entry]).replace(oldText, newText);
      expect(() => parseSummaryBody(body)).toThrow(z.ZodError);
      expect(() => written(body)).toThrow(z.ZodError);
    },
  );

  it("rejects entries that violate the summary schema when writing", () => {
    expect(() => composeSummaryBody([{ ...entry, title: "" }])).toThrow(
      z.ZodError,
    );
  });
});
