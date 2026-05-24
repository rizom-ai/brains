import { describe, expect, it } from "bun:test";
import {
  isSafeLinkHref,
  parseInline,
} from "../ui-react/src/ai-elements/markdown-parser";

describe("parseInline", () => {
  it("returns a single text node for plain text", () => {
    expect(parseInline("hello world")).toEqual([
      { type: "text", text: "hello world" },
    ]);
  });

  it("parses bold runs delimited by **", () => {
    expect(parseInline("a **b** c")).toEqual([
      { type: "text", text: "a " },
      { type: "bold", children: [{ type: "text", text: "b" }] },
      { type: "text", text: " c" },
    ]);
  });

  it("parses italic runs delimited by * or _", () => {
    expect(parseInline("a *b* c")).toEqual([
      { type: "text", text: "a " },
      { type: "italic", children: [{ type: "text", text: "b" }] },
      { type: "text", text: " c" },
    ]);
    expect(parseInline("a _b_ c")).toEqual([
      { type: "text", text: "a " },
      { type: "italic", children: [{ type: "text", text: "b" }] },
      { type: "text", text: " c" },
    ]);
  });

  it("parses inline code delimited by backticks", () => {
    expect(parseInline("call `foo()` here")).toEqual([
      { type: "text", text: "call " },
      { type: "code", text: "foo()" },
      { type: "text", text: " here" },
    ]);
  });

  it("parses links and rejects unsafe schemes", () => {
    expect(parseInline("see [docs](https://example.com)")).toEqual([
      { type: "text", text: "see " },
      {
        type: "link",
        href: "https://example.com",
        children: [{ type: "text", text: "docs" }],
      },
    ]);
    expect(parseInline("[hack](javascript:alert(1))")).toEqual([
      { type: "text", text: "[hack](javascript:alert(1))" },
    ]);
  });

  it("leaves unterminated delimiters as literal text", () => {
    expect(parseInline("a **b c")).toEqual([{ type: "text", text: "a **b c" }]);
  });
});

describe("isSafeLinkHref", () => {
  it.each([
    ["https://example.com", true],
    ["http://example.com", true],
    ["mailto:foo@example.com", true],
    ["/internal/path", true],
    ["#anchor", true],
    ["javascript:alert(1)", false],
    ["data:text/html,foo", false],
    ["vbscript:msgbox", false],
  ])("classifies %s as %s", (href, expected) => {
    expect(isSafeLinkHref(href)).toBe(expected);
  });
});
