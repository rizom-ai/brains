import { describe, it, expect, beforeEach } from "bun:test";
import { SummaryAdapter } from "../../src/adapters/summary-adapter";
import type { SummaryEntry } from "../../src/schemas/summary";
import { createMockSummaryEntity } from "../fixtures/summary-entities";

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

describe("SummaryAdapter", () => {
  let adapter: SummaryAdapter;

  beforeEach(() => {
    adapter = new SummaryAdapter();
  });

  it("describes projected summaries as read-only system memory", () => {
    expect(adapter.purpose).toBe(
      "A read-only, system-maintained summary derived from stored conversation messages.",
    );
  });

  it("creates markdown content for time-based entries", () => {
    const content = adapter.createContentBody([entry]);

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
    const content = adapter.createContentBody([entry]);
    const parsed = adapter.parseBody(content);

    expect(parsed.entries).toHaveLength(1);
    expect(parsed.entries[0]).toEqual(entry);
  });

  it("round-trips entity markdown with frontmatter", () => {
    const entity = createMockSummaryEntity({
      content: adapter.createContentBody([entry]),
    });

    const markdown = adapter.toMarkdown(entity);
    const parsed = adapter.fromMarkdown(markdown);

    expect(markdown).toContain("conversationId: test-conv");
    expect(markdown).toContain("sourceHash: hash-123");
    expect(parsed.entityType).toBe("summary");
    expect(parsed.metadata?.conversationId).toBe("test-conv");
  });

  it("leaves the visibility envelope to the serializer", () => {
    // `EntitySerializer` wraps every adapter's markdown with visibility on
    // the way out and reads it back on the way in, discarding whatever the
    // adapter said. An adapter that writes the key too writes it twice and
    // has its answer thrown away — so this one does not claim it.
    const entity = createMockSummaryEntity({
      content: adapter.createContentBody([entry]),
    });

    expect(adapter.toMarkdown(entity)).not.toContain("visibility:");
    expect(adapter.fromMarkdown(adapter.toMarkdown(entity))).not.toHaveProperty(
      "visibility",
    );
  });
});
