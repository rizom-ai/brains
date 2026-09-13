/** @jsxImportSource react */
import { expect, test } from "bun:test";
import { Window } from "happy-dom";
import { renderToStaticMarkup } from "react-dom/server";
import { StudioMarkdown } from "./studio-markdown";

test("highlighted code stays escaped and overflow regions have accessible names", () => {
  const window = new Window();
  try {
    window.document.body.innerHTML = renderToStaticMarkup(
      <StudioMarkdown presentation="document">
        {'```js\nconst markup = "<script>alert(1)</script>";\n```'}
      </StudioMarkdown>,
    );
    const region = window.document.querySelector(
      '[data-streamdown="code-block-body"]',
    );
    expect(region?.getAttribute("tabindex")).toBe("0");
    expect(region?.getAttribute("aria-label")).toContain("js code");
    expect(region?.textContent).toContain("<script>alert(1)</script>");
    expect(region?.querySelector("script")).toBeNull();
    expect(
      region?.querySelector('[data-code-token="keyword"]')?.textContent,
    ).toBe("const");
  } finally {
    window.close();
  }
});

test.each(["document", "chat", "assist"] as const)(
  "%s tables retain alignment and column headers inside a keyboard-accessible region",
  (presentation) => {
    const window = new Window();
    try {
      window.document.body.innerHTML = renderToStaticMarkup(
        <StudioMarkdown presentation={presentation}>
          {"Item | Count\n--- | ---:\nAlpha | 42\nBeta | 7"}
        </StudioMarkdown>,
      );
      const region = window.document.querySelector(
        '[data-streamdown="table-wrapper"]',
      );
      expect(region?.getAttribute("role")).toBe("region");
      expect(region?.getAttribute("tabindex")).toBe("0");
      expect(region?.getAttribute("aria-label")).toContain("Markdown table");
      expect(
        [...window.document.querySelectorAll("th")].every(
          (cell) => cell.scope === "col",
        ),
      ).toBe(true);
      expect(window.document.querySelectorAll("tbody tr")).toHaveLength(2);
      expect(window.document.querySelectorAll("td")[1]?.style.textAlign).toBe(
        "right",
      );
    } finally {
      window.close();
    }
  },
);
