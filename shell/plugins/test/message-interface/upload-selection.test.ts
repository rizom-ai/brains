import { describe, expect, it } from "bun:test";
import { selectReferencedAttachments } from "../../src/message-interface/upload-selection";

interface TestAttachment {
  filename: string;
  id: string;
}

const uploads: TestAttachment[] = [
  { id: "first", filename: "brief.txt" },
  { id: "middle", filename: "diagram.png" },
  { id: "last", filename: "deck.pdf" },
];

describe("selectReferencedAttachments", () => {
  it("selects uploads by filename mentions", () => {
    expect(
      selectReferencedAttachments("summarize diagram.png", uploads),
    ).toEqual([{ id: "middle", filename: "diagram.png" }]);
  });

  it("selects every matching filename mention", () => {
    expect(
      selectReferencedAttachments("compare brief.txt and deck.pdf", uploads),
    ).toEqual([
      { id: "first", filename: "brief.txt" },
      { id: "last", filename: "deck.pdf" },
    ]);
  });

  it("selects the first upload for first/oldest/earliest wording", () => {
    expect(
      selectReferencedAttachments("use the oldest upload", uploads),
    ).toEqual([{ id: "first", filename: "brief.txt" }]);
    expect(
      selectReferencedAttachments("use the earliest one", uploads),
    ).toEqual([{ id: "first", filename: "brief.txt" }]);
  });

  it("selects the last upload for latest/newest/most recent wording", () => {
    expect(
      selectReferencedAttachments("use the newest upload", uploads),
    ).toEqual([{ id: "last", filename: "deck.pdf" }]);
    expect(
      selectReferencedAttachments("describe the most recent file", uploads),
    ).toEqual([{ id: "last", filename: "deck.pdf" }]);
  });

  it("prefers explicit filename matches over recency wording", () => {
    expect(
      selectReferencedAttachments("use the latest brief.txt", uploads),
    ).toEqual([{ id: "first", filename: "brief.txt" }]);
  });

  it("returns all uploads when no selection hint is present", () => {
    expect(selectReferencedAttachments("summarize these", uploads)).toEqual(
      uploads,
    );
  });

  it("handles empty uploads", () => {
    expect(selectReferencedAttachments("latest", [])).toEqual([]);
  });
});
