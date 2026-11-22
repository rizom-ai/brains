import { describe, expect, it } from "bun:test";
import { z } from "@brains/utils/zod";
import { StructuredContentFormatter } from "./structured-content";

/**
 * A file a brain holds in the sectioned layout is read by a type that opted
 * in to the compact layout as the sectioned reader read it: a heading the
 * type does not name is ignored, "so no file a brain holds today is refused
 * by a check it did not have" (docs/external-plugin-authoring.md, The stored format). Laying it out
 * anew refuses to drop that heading: the file stays as written, for its
 * author to settle.
 */
describe("a compact type reading a sectioned file", () => {
  const schema = z.object({ cap: z.string(), headline: z.string() });
  const compact = new StructuredContentFormatter(schema, {
    title: "Hero",
    layout: "compact",
    mappings: [
      { key: "cap", label: "Cap", type: "string" },
      { key: "headline", label: "Headline", type: "string" },
    ],
  });
  const sectioned =
    "# Hero\n\n## Cap\n\nThe tools\n\n## Headline\n\nBuild it.\n";
  const withStale = `${sectioned}\n## Cap Note\n\nAn older field.\n`;

  it("reads it, ignoring a heading the type does not name", () => {
    expect(compact.parse(withStale)).toEqual({
      cap: "The tools",
      headline: "Build it.",
    });
  });

  it("lays out a sectioned file whose every heading it names", () => {
    const laidOut = compact.layOut(sectioned);
    expect(laidOut).not.toContain("# Hero");
    expect(compact.parse(laidOut)).toEqual({
      cap: "The tools",
      headline: "Build it.",
    });
  });

  it("refuses to lay out a sectioned file with a heading it would drop", () => {
    expect(() => compact.layOut(withStale)).toThrow("Cap Note");
  });

  it("leaves a document as it is for a type that writes the sectioned layout", () => {
    const sectioned = new StructuredContentFormatter(schema, {
      title: "Hero",
      mappings: [
        { key: "cap", label: "Cap", type: "string" },
        { key: "headline", label: "Headline", type: "string" },
      ],
    });
    expect(sectioned.layOut(withStale)).toBe(withStale);
  });

  it("still refuses a compact file with a heading it does not name", () => {
    expect(() =>
      compact.parse(
        "## Cap\n\nThe tools\n\n## Headline\n\nB\n\n## Cap Note\n\nx\n",
      ),
    ).toThrow("Cap Note");
  });
});
