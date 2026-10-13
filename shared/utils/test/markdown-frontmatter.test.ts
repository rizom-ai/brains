import { expect, test } from "bun:test";
import { parseMarkdown } from "../src/markdown-frontmatter";

test("uncached frontmatter parsing rejects malformed YAML on every read", () => {
  const content = "---\ninvalid-uncached: [unfinished\n---\n";
  // Even a failed cached read can leave gray-matter's cache populated.
  expect(() => parseMarkdown(content)).toThrow();
  expect(() => parseMarkdown(content, { cache: false })).toThrow();
  expect(() => parseMarkdown(content, { cache: false })).toThrow();
});

test("uncached parsing does not share nested objects with earlier reads", () => {
  const content = "---\nvalues: [First]\n---\n\nBody\n";
  const first = parseMarkdown(content, { cache: false });
  if (Array.isArray(first.frontmatter["values"]))
    first.frontmatter["values"].push("Changed");
  expect(parseMarkdown(content, { cache: false })).toEqual({
    frontmatter: { values: ["First"] },
    content: "Body",
  });
});
