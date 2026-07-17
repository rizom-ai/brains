import { describe, expect, it } from "bun:test";
import { summarizeLinkedInSnapshotSchema } from "../src/lib/snapshot-schema";

describe("summarizeLinkedInSnapshotSchema", () => {
  it("returns deterministic field metadata without source values", () => {
    const summary = summarizeLinkedInSnapshotSchema([
      {
        Name: "private value",
        Active: true,
        Score: 2,
        Tags: ["private"],
        Details: { private: "value" },
        Ended: null,
      },
      { Name: "another private value", Score: "unknown" },
    ]);

    expect(summary).toEqual({
      recordsRead: 2,
      fields: [
        { name: "Active", types: ["boolean"], presentCount: 1 },
        { name: "Details", types: ["object"], presentCount: 1 },
        { name: "Ended", types: ["null"], presentCount: 1 },
        { name: "Name", types: ["string"], presentCount: 2 },
        {
          name: "Score",
          types: ["number", "string"],
          presentCount: 2,
        },
        { name: "Tags", types: ["array"], presentCount: 1 },
      ],
      recordShapes: [
        {
          Active: "<boolean>",
          Details: "<object>",
          Ended: null,
          Name: "<string>",
          Score: "<number>",
          Tags: ["<string>"],
        },
        { Name: "<string>", Score: "<string>" },
      ],
    });
    const serialized = JSON.stringify(summary);
    expect(serialized).not.toContain("private value");
    expect(serialized).not.toContain("another private value");
    expect(serialized).not.toContain('"private"');
  });

  it("preserves safe string format categories without preserving strings", () => {
    const summary = summarizeLinkedInSnapshotSchema([
      {
        Year: "2025",
        Month: "2025-03",
        Date: "2025-03-14",
        Timestamp: "2025-03-14T12:30:00Z",
        NamedMonth: "March 2025",
        Url: "https://private.example/member/ada",
        Email: "ada@private.example",
        Urn: "urn:li:private:123",
        Empty: "   ",
        Values: [null, 1, true, "2025-03", { secret: "value" }, ["secret"]],
      },
    ]);

    expect(summary.recordShapes).toEqual([
      {
        Date: "<year-month-day>",
        Email: "<email>",
        Empty: "<empty-string>",
        Month: "<year-month>",
        NamedMonth: "<month-year>",
        Timestamp: "<timestamp>",
        Url: "<url>",
        Urn: "<urn>",
        Values: [
          "<array>",
          "<boolean>",
          "<null>",
          "<number>",
          "<object>",
          "<year-month>",
        ],
        Year: "<year>",
      },
    ]);
    const serialized = JSON.stringify(summary.recordShapes);
    expect(serialized).not.toContain("private.example");
    expect(serialized).not.toContain("secret");
  });
});
