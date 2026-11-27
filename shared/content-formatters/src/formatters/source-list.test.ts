import { describe, expect, it } from "bun:test";
import {
  formatSourceList,
  parseSourceList,
  type StoredSource,
} from "./source-list";

describe("a list of sources in a stored body", () => {
  const sources: StoredSource[] = [
    {
      id: "book-section:brumaire/i",
      title: "Der achtzehnte Brumaire, I",
      url: "https://karl.example/books/brumaire/i",
    },
    { id: "post:publishing", title: "Publishing [from] Studio" },
    {
      id: "note:a note with spaces",
      title: "A note",
      brain: { name: "Karl", url: "https://karl.example" },
    },
    { id: "post:plain", title: "Plain", brain: { name: "A brain" } },
  ];

  it("writes one linked item per source", () => {
    expect(formatSourceList(sources)).toBe(
      [
        '- [Der achtzehnte Brumaire, I](https://karl.example/books/brumaire/i "book-section:brumaire/i")',
        "- [Publishing \\[from\\] Studio](post:publishing)",
        "- [A note](<note:a note with spaces>) — from [Karl](https://karl.example)",
        "- [Plain](post:plain) — from A brain",
      ].join("\n"),
    );
  });

  it("reads back the sources it wrote", () => {
    expect(parseSourceList(formatSourceList(sources))).toEqual(sources);
  });

  it("reads a line that is no source without an id, so validation refuses it", () => {
    expect(parseSourceList("- just some text")).toEqual([
      { id: "", title: "- just some text" },
    ]);
  });
});
