/** @jsxImportSource react */
import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { Window } from "happy-dom";
import { renderToStaticMarkup } from "react-dom/server";
import * as stylex from "@stylexjs/stylex";
import { BodyEditor } from "./body-editor";
import { StudioAppStatus } from "./app-view";
import { StudioMarkdown } from "./studio-markdown";
import { libraryStyles as library } from "./studio-library.styles";
import { editorLayoutStyles as layout } from "./studio-editor-layout.styles";
import { Field } from "./entity-fields";
const css = readFileSync(
  new URL("../../dist/ui/studio-app.css", import.meta.url),
  "utf8",
);
for (const width of [1440, 768, 390])
  test(`compiled Studio editor and library presentation at ${width}px`, async () => {
    const window = new Window({ width });
    try {
      const doc = window.document;
      doc.head.innerHTML = `<style>:root{--console-display:Georgia;--console-ui:Arial;--console-mono:monospace;--console-touch:44px}${css}</style>`;
      doc.body.innerHTML = renderToStaticMarkup(
        <>
          <StudioAppStatus message="Exact boot message" />
          <main {...stylex.props(library.listing)}>
            <button {...stylex.props(library.row)} data-studio-record="">
              <span {...stylex.props(library.title)}>Full title α—/</span>
              <span {...stylex.props(library.updated)}>Exact timestamp</span>
            </button>
          </main>
          <fieldset {...stylex.props(layout.fields)}>
            <Field
              descriptor={{
                name: "weight",
                label: "Weight",
                widget: "number",
                required: false,
              }}
              value={0}
              onChange={() => {}}
            />
            <Field
              descriptor={{
                name: "raw",
                label: "Raw",
                widget: "object",
                required: false,
              }}
              value={{ zero: 0, off: false, empty: null }}
              onChange={() => {}}
            />
            <Field
              descriptor={{
                name: "tags",
                label: "Tags",
                widget: "list",
                field: { name: "tag", label: "Tag", widget: "string" },
              }}
              value={["Exact tag α"]}
              onChange={() => {}}
            />
          </fieldset>
          <BodyEditor
            value={
              "# Exact heading\n\nLiteral *emphasis* and `code`.\n\n```ts\nconst first = 1;\nconst second = 2;\n```"
            }
            mode="preview"
            onChange={() => {}}
            onModeChange={() => {}}
          />
        </>,
      );
      expect(doc.body.querySelector("style")).toBeNull();
      const fields = doc.querySelector("fieldset"),
        number = doc.querySelector("input[type=number]"),
        raw = doc.querySelector("textarea"),
        tag = doc.querySelector("[data-studio-field=tags] input"),
        remove = doc.querySelector('button[aria-label="Remove Exact tag α"]');
      if (!fields || !number || !raw || !tag || !remove)
        throw Error("Missing field controls");
      expect(parseFloat(window.getComputedStyle(fields).borderTopWidth)).toBe(
        0,
      );
      expect(number.getAttribute("value")).toBe("0");
      expect(raw.hasAttribute("disabled")).toBe(true);
      expect(raw.textContent).toBe(
        JSON.stringify({ zero: 0, off: false, empty: null }, null, 2),
      );
      expect(window.getComputedStyle(raw).borderTopStyle).toBe("dashed");
      expect(parseFloat(window.getComputedStyle(tag).borderTopWidth)).toBe(0);
      expect(window.getComputedStyle(tag).fontSize).toBe(
        width <= 640 ? "16px" : "12px",
      );
      expect(window.getComputedStyle(remove).width).toBe(
        width <= 640 ? "44px" : "20px",
      );
      const preview = doc.querySelector("[data-studio-preview]"),
        title = doc.querySelector("[data-studio-record] span");
      if (!preview || !title) throw Error("Missing native surfaces");
      expect(title.textContent).toBe("Full title α—/");
      expect(window.getComputedStyle(title).fontSize).toBe(
        width <= 640 ? "17px" : "17.5px",
      );
      expect(window.getComputedStyle(title).overflowWrap).toBe("anywhere");
      const heading = preview.querySelector("h1"),
        code = preview.querySelector('[data-streamdown="inline-code"]'),
        codeBlock = preview.querySelector('[data-streamdown="code-block"]'),
        copy = preview.querySelector(
          '[data-streamdown="code-block-copy-button"]',
        );
      if (!heading || !code || !codeBlock || !copy)
        throw Error("Missing prose slots");
      expect(heading.textContent).toBe("Exact heading");
      expect(window.getComputedStyle(heading).fontSize).toBe(
        width <= 640 ? "27px" : "30px",
      );
      expect(window.getComputedStyle(preview).paddingLeft).toBe(
        width <= 640 ? "18px" : width <= 900 ? "24px" : "34px",
      );
      expect(code.textContent).toBe("code");
      expect(window.getComputedStyle(code).fontSize).toBe("12.5px");
      expect(window.getComputedStyle(codeBlock).display).toBe("flex");
      expect(window.getComputedStyle(copy).width).toBe(
        width <= 640 ? "44px" : "28px",
      );
    } finally {
      await window.happyDOM.close();
    }
  });
test("compiled prose retains safe links, fenced-code controls and ordered-list starts", () => {
  const html = renderToStaticMarkup(
    <StudioMarkdown presentation="document">
      {
        "3. Third\n4. Fourth\n\n[Exact link](https://example.com/path?q=a%2Fb)\n\n```ts\nconst zero = 0;\n```"
      }
    </StudioMarkdown>,
  );
  expect(html).toContain('start="3"');
  expect(html).toContain('data-streamdown="link"');
  expect(html).toContain('type="button">Exact link</button>');
  expect(html).toContain('data-streamdown="code-block-actions"');
  expect(html).toContain('data-streamdown="code-block-copy-button"');
  expect(html).not.toContain('data-streamdown="code-block-download-button"');
  expect(html).toContain('data-language="ts"');
  expect(html).toContain("const zero = 0;");
  expect(html).not.toContain('node="');
});
