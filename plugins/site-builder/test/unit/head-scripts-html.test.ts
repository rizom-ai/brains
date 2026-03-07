import { describe, it, expect } from "bun:test";
import { createHTMLShell } from "../../src/lib/html-generator";

describe("createHTMLShell head scripts", () => {
  it("should include head scripts in the HTML output", () => {
    const html = createHTMLShell(
      "<p>content</p>",
      undefined, // headContent
      "Test",
      "dark",
      undefined, // analyticsScript (legacy, to be removed)
      ['<script src="analytics.js"></script>'],
    );

    expect(html).toContain('<script src="analytics.js"></script>');
  });

  it("should include multiple head scripts", () => {
    const html = createHTMLShell(
      "<p>content</p>",
      undefined,
      "Test",
      "dark",
      undefined,
      [
        '<script src="analytics.js"></script>',
        '<script src="newsletter.js"></script>',
      ],
    );

    expect(html).toContain('<script src="analytics.js"></script>');
    expect(html).toContain('<script src="newsletter.js"></script>');
  });

  it("should render correctly with no head scripts", () => {
    const html = createHTMLShell(
      "<p>content</p>",
      undefined,
      "Test",
      "dark",
      undefined,
      [],
    );

    expect(html).toContain("<p>content</p>");
    expect(html).not.toContain("undefined");
  });

  it("should render correctly when headScripts is undefined", () => {
    const html = createHTMLShell("<p>content</p>", undefined, "Test", "dark");

    expect(html).toContain("<p>content</p>");
    expect(html).not.toContain("undefined");
  });

  it("should place head scripts before closing </head>", () => {
    const html = createHTMLShell(
      "<p>content</p>",
      undefined,
      "Test",
      "dark",
      undefined,
      ['<script src="test.js"></script>'],
    );

    const scriptIndex = html.indexOf('<script src="test.js">');
    const headCloseIndex = html.indexOf("</head>");
    expect(scriptIndex).toBeGreaterThan(-1);
    expect(headCloseIndex).toBeGreaterThan(scriptIndex);
  });
});
