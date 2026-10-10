import { describe, expect, it } from "bun:test";
import { expectBodyRoundTrip } from "@brains/test-utils";
import { z } from "@brains/sdk/entities";
import {
  composeSummaryBody,
  parseSummaryBody,
  summaryBodyCodec,
} from "../../src/lib/summary-body";
import { summary } from "../../src/summary-entity";
import { composeMemoryMarkdown } from "../../src/lib/memory-markdown";
import {
  appendMemoryProjectionEnvelope,
  parseMemoryProjectionEnvelope,
} from "../../src/lib/memory-projection-envelope";
import { defaultSummaryMetadata } from "../fixtures/summary-entities";
import type { SummaryBody, SummaryEntry } from "../../src/schemas/summary";

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
const formatter = {
  format: (body: SummaryBody): string => z.encode(summaryBodyCodec, body),
  parse: (markdown: string): SummaryBody =>
    z.decode(summaryBodyCodec, markdown),
};
const decode = summary.markdown?.decode;
const encode = summary.markdown?.encode;
if (!decode || !encode) throw new Error("Missing summary markdown declaration");

describe("declarative summary body codec", () => {
  it("round-trips entries and an empty summary", () => {
    expectBodyRoundTrip(formatter, {
      entries: [entry, { ...entry, title: "Next Steps", keyPoints: [] }],
    });
    expectBodyRoundTrip(formatter, { entries: [] });
  });

  it.each([
    ["invalid time", "Time: 2026-01-01T00:00:00.000Z", "Time: yesterday"],
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
    "rejects %s without dropping an entry on read or export",
    (_label, oldText, replacement) => {
      const body = composeSummaryBody([
        entry,
        { ...entry, title: "Next Steps" },
      ]).replace(oldText, replacement);
      expect(() => parseSummaryBody(body)).toThrow(z.ZodError);
      expect(() =>
        decode({ content: body, frontmatter: defaultSummaryMetadata }),
      ).toThrow(z.ZodError);
      expect(() =>
        encode({ content: body, metadata: defaultSummaryMetadata }),
      ).toThrow(z.ZodError);
      expect(body).toContain("Next Steps");
    },
  );

  it("rejects invalid entries before writing", () => {
    expect(() => composeSummaryBody([{ ...entry, title: "" }])).toThrow(
      z.ZodError,
    );
  });

  it("preserves embedded metadata and projection provenance", () => {
    const envelope = { version: 1 as const, decisions: [], actionItems: [] };
    const body = appendMemoryProjectionEnvelope(
      composeSummaryBody([entry]),
      envelope,
    );
    const content = composeMemoryMarkdown(body, {
      ...defaultSummaryMetadata,
      authored: "keep",
    });
    const encoded = encode({
      content,
      metadata: defaultSummaryMetadata,
    });
    expect(parseSummaryBody(encoded.content)).toEqual({ entries: [entry] });
    expect(parseMemoryProjectionEnvelope(encoded.content)).toEqual(envelope);
    expect(encoded.content).toContain("authored: keep");
    expect(encoded.frontmatter).toEqual({});
  });
});
