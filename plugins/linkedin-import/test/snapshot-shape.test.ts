import { describe, expect, it } from "bun:test";
import { summarizeSnapshotShape } from "../src/lib/snapshot-shape";

const SECRET = "SENTINEL-MEMBER-VALUE";

const positions = [
  {
    "Company Name": `${SECRET} Corp`,
    Title: `${SECRET} lead`,
    "Started On": "Mar 2019",
    "Finished On": "",
    Location: { City: SECRET, Country: SECRET },
    Tags: [SECRET, "https://example.com/x", 2021],
  },
  {
    "Company Name": `${SECRET} Lab`,
    Title: `${SECRET} advisor`,
    "Started On": "2021-04",
    "Company URN": "urn:li:organization:123",
  },
];

describe("summarizeSnapshotShape", () => {
  it("never returns a member value or a nested key", () => {
    const shown = JSON.stringify(summarizeSnapshotShape(positions));

    expect(shown).not.toContain(SECRET);
    expect(shown).not.toContain("City");
    expect(shown).not.toContain("example.com");
  });

  it("counts each field's presence and value types", () => {
    const summary = summarizeSnapshotShape(positions);

    expect(summary.recordsRead).toBe(2);
    expect(summary.fields).toContainEqual({
      name: "Company Name",
      types: ["string"],
      presentCount: 2,
    });
    expect(summary.fields).toContainEqual({
      name: "Location",
      types: ["object"],
      presentCount: 1,
    });
    expect(summary.fields.map((field) => field.name)).toEqual(
      [...summary.fields.map((field) => field.name)].sort(),
    );
  });

  it("keeps one redacted shape per distinct record form", () => {
    const summary = summarizeSnapshotShape([...positions, positions[0] ?? {}]);

    expect(summary.recordShapes).toHaveLength(2);
    expect(summary.recordShapes).toContainEqual({
      "Company Name": "<string>",
      "Finished On": "<empty-string>",
      Location: "<object>",
      "Started On": "<month-year>",
      Tags: ["<number>", "<string>", "<url>"],
      Title: "<string>",
    });
    expect(summary.recordShapes).toContainEqual({
      "Company Name": "<string>",
      "Company URN": "<urn>",
      "Started On": "<year-month>",
      Title: "<string>",
    });
  });

  it("summarizes no records as empty", () => {
    expect(summarizeSnapshotShape([])).toEqual({
      recordsRead: 0,
      fields: [],
      recordShapes: [],
    });
  });
});
