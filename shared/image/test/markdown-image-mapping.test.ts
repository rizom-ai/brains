import { expect, it } from "bun:test";
import {
  mapMarkdownImageUrls,
  extractMarkdownImages,
} from "../src/lib/markdown-images";

it("maps real inline and reference-style images, not links or code", () => {
  const input =
    '![inline](<entity://image/a> "Title")\n\n![reference][pic]\n\n[ordinary][pic]\n\n[pic]: entity://image/a "Caption"\n\n`![code](entity://image/a)`\n\n```md\n![fenced](entity://image/a)\n```\n';
  const seen: string[] = [];
  const output = mapMarkdownImageUrls(input, (url) => {
    seen.push(url);
    return "https://pds.test/image?a=1&b=2";
  });
  expect(seen).toEqual(["entity://image/a", "entity://image/a"]);
  expect(extractMarkdownImages(output).map((image) => image.url)).toEqual([
    "https://pds.test/image?a=1&b=2",
    "https://pds.test/image?a=1&b=2",
  ]);
  expect(output).toContain("[ordinary][pic]");
  expect(output).toContain('[pic]: entity://image/a "Caption"');
  expect(output).toContain("`![code](entity://image/a)`");
  expect(output).toContain("![fenced](entity://image/a)");
});

it("preserves exact markdown when no destination changes", () => {
  const source = "## Header\n\n  ![external](https://example.test/a)\n";
  expect(mapMarkdownImageUrls(source, (url) => url)).toBe(source);
});

it("uses the first definition and supports collapsed and shortcut image references", () => {
  const seen: string[] = [];
  mapMarkdownImageUrls(
    "![Pic][] ![Pic]\n\n[Pic]: entity://image/first\n[Pic]: entity://image/second",
    (url) => {
      seen.push(url);
      return url;
    },
  );
  expect(seen).toEqual(["entity://image/first", "entity://image/first"]);
});
