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
    });
    const serialized = JSON.stringify(summary);
    expect(serialized).not.toContain("private value");
    expect(serialized).not.toContain("another private value");
  });
});
