import { describe, expect, it } from "bun:test";
import { fromYaml, isValidYaml, parseYamlDocument } from "../src/yaml";
import { generateMarkdown, parseMarkdown } from "../src/markdown-frontmatter";

function mergedSequence(count: number): string {
  return `base: &base { color: blue }\nresult:\n  <<: [${Array(count).fill("*base").join(", ")}]\n  color: red\n`;
}

function emptyMerges(count: number): string {
  const lines = ["base: &empty {}"];
  for (let offset = 0; offset < count; offset += 100) {
    const sources = Array(Math.min(100, count - offset)).fill("*empty");
    lines.push(`result${offset / 100}: { <<: [${sources.join(", ")}] }`);
  }
  return lines.join("\n");
}

const readers: Array<[string, (source: string) => unknown]> = [
  ["YAML utility", fromYaml],
  [
    "uncached Markdown frontmatter",
    (source): unknown =>
      parseMarkdown(`---\n${source}\n---\nBody`, { cache: false }).frontmatter,
  ],
];

for (const [name, read] of readers) {
  describe(name, () => {
    it("accepts exactly 100 merge sources and preserves explicit overrides", () => {
      expect(read(mergedSequence(100))).toEqual({
        base: { color: "blue" },
        result: { color: "red" },
      });
    });

    it("refuses a 101-source merge sequence on every uncached read", () => {
      const source = mergedSequence(101);
      expect(() => read(source)).toThrow("abnormal merge sequence size");
      expect(() => read(source)).toThrow("abnormal merge sequence size");
    });

    it("charges empty mappings to the existing 10000-unit merge budget", () => {
      const expected = Object.fromEntries([
        ["base", {}],
        ...Array.from({ length: 100 }, (_, index) => [`result${index}`, {}]),
      ]);
      expect(read(emptyMerges(10000))).toEqual(expected);
      expect(() => read(emptyMerges(10001))).toThrow(
        "maxTotalMergeKeys (10000)",
      );
    });

    it("preserves ordered-map keys that also exist on Object.prototype", () => {
      const entries = [
        '"__proto__": first',
        "constructor: second",
        "hasOwnProperty: third",
        "toString: fourth",
      ];
      const source = `entries: !!omap\n${entries.map((entry) => `  - ${entry}`).join("\n")}\n`;
      expect(read(source)).toEqual({
        entries: [
          JSON.parse('{"__proto__":"first"}'),
          { constructor: "second" },
          { hasOwnProperty: "third" },
          { toString: "fourth" },
        ],
      });
      expect(() => read(`${source}  - "__proto__": duplicate\n`)).toThrow();
    });
  });
}

it("returns validation failure rather than a partial oversized-merge document", () => {
  const source = mergedSequence(101);
  expect(isValidYaml(source)).toBe(false);
  expect(parseYamlDocument(source)).toMatchObject({ ok: false });
  expect(isValidYaml(mergedSequence(100))).toBe(true);
});

it("retains ordinary authored extension fields and Markdown body through round-trip", () => {
  const frontmatter = {
    title: "Authored title",
    visibility: "public",
    status: "published",
    extension: { nested: ["first", "second"], enabled: false },
  };
  const body =
    "## Retained heading\n\nAuthored **Markdown** and [link](https://example.invalid).";
  expect(
    parseMarkdown(generateMarkdown(frontmatter, body), { cache: false }),
  ).toEqual({ frontmatter, content: body });
});
