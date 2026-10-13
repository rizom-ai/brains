import { describe, expect, test } from "bun:test";
import {
  generateMarkdown,
  parseMarkdown,
  readMarkdownFrontmatter,
  updateFrontmatterField,
} from "../src/markdown-frontmatter";
import { fromYaml } from "../src/yaml";

test("uncached frontmatter parsing rejects malformed YAML on every read", () => {
  const content = "---\ninvalid-uncached: [unfinished\n---\n";
  // Every read, including the default mode, must validate malformed data.
  expect(() => parseMarkdown(content)).toThrow();
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

describe("frontmatter data languages", () => {
  test("retains approved numeric semantics, without changing ordinary YAML", () => {
    const result = parseMarkdown(
      "---\noctal: 012\nmodern: 0o12\nclock: 12:34\nfraction: 1:20.5\nleading: 08\nsigned: -.2\nquoted: '012'\n---\nBody",
    );
    expect(result.frontmatter).toEqual({
      octal: 10,
      modern: "0o12",
      clock: 754,
      fraction: 80.5,
      leading: "08",
      signed: "-.2",
      quoted: "012",
    });
    expect(fromYaml("octal: 012")).toEqual({ octal: 12 });
    expect(
      parseMarkdown(generateMarkdown(result.frontmatter, result.content)),
    ).toEqual(result);
  });

  test("retains explicit numeric tags and rejects invalid numeric scalars", () => {
    expect(
      parseMarkdown("---\nv: !!int 012\nf: !!float 1:20.5\n---").frontmatter,
    ).toEqual({ v: 10, f: 80.5 });
    expect(() => parseMarkdown("---\nv: !!int 0o12\n---")).toThrow();
    expect(() => parseMarkdown("---\nv: !!int 08\n---")).toThrow();
  });

  test("supports JSON and YAML aliases while preserving untrimmed reader bodies", () => {
    const content = "  Body\r\n\r\n";
    for (const label of ["json", "yaml", "YAML", "yml"]) {
      expect(
        readMarkdownFrontmatter(
          `---${label}\r\n{"title":"Test"}\r\n---\r\n${content}`,
        ),
      ).toMatchObject({ data: { title: "Test" }, content });
    }
    expect(
      parseMarkdown('---json\n{"title":"Test"}\n---\n Body ').content,
    ).toBe("Body");
  });

  test("rejects executable/unknown headers even for empty blocks", () => {
    for (const label of ["js", "javascript", "JAVASCRIPT", "toml", "json5"]) {
      // Do not invoke or evaluate the removed executable engine.
      expect(() => readMarkdownFrontmatter(`---${label}\n---\nBody`)).toThrow(
        "Unsupported frontmatter language",
      );
      expect(() =>
        generateMarkdown({ title: "Test" }, `---${label}\n---`),
      ).toThrow("Unsupported frontmatter language");
    }
    expect(() =>
      parseMarkdown("---\nv: !!js/function 'not executable data'\n---"),
    ).toThrow();
  });

  test("preserves dates, binary buffers, aliases and explicit null", () => {
    const source =
      "---\ndate: 2026-01-01\nbytes: !!binary SGk=\na: &a [first]\nb: *a\nnothing: null\n---\nBody";
    const parsed = parseMarkdown(source);
    expect(parsed.frontmatter["date"]).toEqual(
      new Date("2026-01-01T00:00:00Z"),
    );
    expect(parsed.frontmatter["bytes"]).toEqual(Buffer.from("Hi"));
    expect(parsed.frontmatter["a"]).toBe(parsed.frontmatter["b"]);
    expect(parsed.frontmatter["nothing"]).toBeNull();
    expect(
      parseMarkdown(generateMarkdown(parsed.frontmatter, parsed.content)),
    ).toEqual(parsed);
  });

  test("default reads do not share nested objects", () => {
    const source = "---\nvalues: [First]\n---\nBody";
    const first = parseMarkdown(source);
    if (Array.isArray(first.frontmatter["values"]))
      first.frontmatter["values"].push("Changed");
    expect(parseMarkdown(source).frontmatter).toEqual({ values: ["First"] });
  });

  test("retains delimiter, BOM, comment and end-of-file behavior", () => {
    expect(
      readMarkdownFrontmatter("\uFEFF---\r\ntitle: Test\r\n---\r\nBody\r\n"),
    ).toMatchObject({ data: { title: "Test" }, content: "Body\r\n" });
    expect(readMarkdownFrontmatter("---\n# comment\n---\nBody").data).toEqual(
      {},
    );
    expect(readMarkdownFrontmatter("---\ntitle: Test")).toMatchObject({
      data: { title: "Test" },
      content: "",
    });
    expect(readMarkdownFrontmatter("----\nBody").content).toBe("----\nBody");
    expect(
      readMarkdownFrontmatter("before\n---\ntitle: Test\n---").data,
    ).toEqual({});
    expect(readMarkdownFrontmatter("---\ntitle: Test\n---suffix").content).toBe(
      "suffix",
    );
  });

  test("keeps scalar validation with the caller and utility field projection", () => {
    expect(readMarkdownFrontmatter("---\n42\n---").data).toBe(42);
    expect(readMarkdownFrontmatter("---\nnull\n---").data).toEqual({});
    expect(readMarkdownFrontmatter("---\nfalse\n---").data).toBe(false);
    expect(readMarkdownFrontmatter("---\n0\n---").data).toBe(0);
    expect(readMarkdownFrontmatter("---\n''\n---").data).toBe("");
    expect(readMarkdownFrontmatter("---\n.nan\n---").data).toBeNaN();
    expect(parseMarkdown("---\n42\n---").frontmatter).toEqual({});
    expect(parseMarkdown("---\n[one, two]\n---").frontmatter).toEqual({
      "0": "one",
      "1": "two",
    });
  });

  test("retains colon-string quoting required by publishing consumers", () => {
    expect(
      generateMarkdown({ platformPostId: "urn:li:share:123" }, "Body"),
    ).toBe("---\nplatformPostId: 'urn:li:share:123'\n---\nBody\n");
    expect(
      parseMarkdown(generateMarkdown({ url: "https://example.com/a" }, "Body"))
        .frontmatter,
    ).toEqual({ url: "https://example.com/a" });
  });

  test("generation merges existing fields and preserves the body/newline", () => {
    expect(
      generateMarkdown(
        { title: "New" },
        "---\ntitle: Old\ncustom: kept\n---\n  Body  ",
      ),
    ).toBe("---\ntitle: New\ncustom: kept\n---\n  Body  \n");
    expect(generateMarkdown({}, "")).toBe("\n");
    expect(generateMarkdown({}, "Body\n")).toBe("Body\n");
    expect(
      generateMarkdown({ title: "New" }, '---json\n{"custom":1}\n---\nBody'),
    ).toBe('---\n{\n  "custom": 1,\n  "title": "New"\n}\n---\nBody\n');
  });

  test("field edits retain unknown data and protected-key own properties", () => {
    const source =
      "---\ntitle: Old\ncustom: {nested: [one]}\n__proto__: {saved: true}\n---\nBody";
    const result = parseMarkdown(
      updateFrontmatterField(source, "title", "New"),
    );
    expect(result.frontmatter["custom"]).toEqual({ nested: ["one"] });
    expect(Object.hasOwn(result.frontmatter, "__proto__")).toBe(true);
    expect(result.frontmatter["__proto__"]).toEqual({ saved: true });
    expect(Object.getPrototypeOf(result.frontmatter)).toBe(Object.prototype);
    expect(result.content).toBe("Body");
  });
});
