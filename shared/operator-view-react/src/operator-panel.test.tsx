/** @jsxImportSource react */
import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { Window } from "happy-dom";
import {
  OperatorPanel,
  OperatorPanelGrid,
  operatorViewStylexCSS,
} from "@brains/operator-view-react";

for (const width of [1440, 768, 390]) {
  test(`compiled panels preserve grid, headings, and all inset variants at ${width}px`, async () => {
    const window = new Window({ width });
    try {
      const document = window.document;
      document.head.innerHTML = `<style>${operatorViewStylexCSS}</style>`;
      document.body.innerHTML = renderToStaticMarkup(
        <OperatorPanelGrid className="host-grid">
          {(["standard", "tight", "flush-bottom"] as const).map((inset) => (
            <OperatorPanel
              key={inset}
              id={inset}
              heading="Public content"
              source="public scope"
              inset={inset}
              className="host-panel"
              aria-label="Public content"
              data-source-id="provider:content"
            >
              <a href="/ask">Ask</a>
            </OperatorPanel>
          ))}
        </OperatorPanelGrid>,
      );
      const grid = document.querySelector(".host-grid");
      if (!grid) throw new Error("Missing panel grid");
      expect(window.getComputedStyle(grid).gap).toBe(
        width <= 640 ? "9px" : "14px",
      );
      expect(window.getComputedStyle(grid).gridTemplateColumns).toBe(
        width <= 900 ? "minmax(0,1fr)" : "repeat(2,minmax(0,1fr))",
      );
      for (const inset of ["standard", "tight", "flush-bottom"]) {
        const panel = document.getElementById(inset);
        const header = panel?.querySelector("header");
        const title = header?.firstElementChild;
        const source = header?.lastElementChild;
        if (!panel || !header || !title || !source)
          throw new Error("Missing panel header");
        const css = window.getComputedStyle(panel);
        expect(css.borderTopWidth).toBe("1px");
        expect(css.borderRadius).toBe(width <= 640 ? "9px" : "10px");
        expect(css.paddingTop).toBe(
          inset === "flush-bottom"
            ? "16px"
            : inset === "tight" && width <= 640
              ? "12px"
              : "14px",
        );
        expect(css.paddingBottom).toBe(
          inset === "flush-bottom"
            ? "0px"
            : width <= 640
              ? inset === "tight"
                ? "12px"
                : "14px"
              : "16px",
        );
        expect(css.paddingLeft).toBe(
          inset === "flush-bottom" || width > 640
            ? "18px"
            : inset === "tight"
              ? "12px"
              : "14px",
        );
        expect(css.overflowWrap).toBe("anywhere");
        expect(window.getComputedStyle(header).marginBottom).toBe(
          width <= 640 ? "10px" : "12px",
        );
        expect(window.getComputedStyle(title).fontSize).toBe("10.5px");
        expect(window.getComputedStyle(source).fontSize).toBe(
          width <= 640 ? "8.5px" : "10px",
        );
        expect(panel.getAttribute("data-source-id")).toBe("provider:content");
        expect(panel.getAttribute("aria-label")).toBe("Public content");
        expect(panel.querySelector("a")?.getAttribute("href")).toBe("/ask");
        expect(panel.hasAttribute("inset")).toBe(false);
      }
      expect(document.body.querySelector("style,[style]")).toBeNull();
    } finally {
      await window.happyDOM.abort();
    }
  });
}

test("panels retain authored copy and direct header accessories without manufacturing metadata", async () => {
  const window = new Window();
  try {
    const title = "unbroken".repeat(80) + " <script>";
    const html = renderToStaticMarkup(
      <OperatorPanel
        heading={title}
        accessory={
          <button type="button" aria-label="Inspect source">
            Inspect
          </button>
        }
      >
        <p>Source & details</p>
      </OperatorPanel>,
    );
    window.document.body.innerHTML = html;
    const header = window.document.querySelector("article > header");
    expect(header?.firstElementChild.textContent).toBe(title);
    expect(header?.children.length).toBe(2);
    expect(header?.lastElementChild.tagName).toBe("BUTTON");
    expect(window.document.querySelector("script")).toBeNull();
    expect(
      renderToStaticMarkup(<OperatorPanel heading="Empty" />),
    ).not.toContain("undefined");
    expect(html).not.toContain("card-head");
  } finally {
    await window.happyDOM.abort();
  }
});

test("production SSR renders compiled panels without a DOM or compiler loader", () => {
  const root = new URL("../../../", import.meta.url).pathname;
  const entry = new URL("../dist/index.js", import.meta.url).pathname;
  const result = Bun.spawnSync(
    [
      process.execPath,
      "-e",
      `import {createElement as h} from "react"; import {renderToStaticMarkup} from "react-dom/server"; import {OperatorPanel,OperatorPanelGrid} from ${JSON.stringify(entry)}; console.log(renderToStaticMarkup(h(OperatorPanelGrid,{},h(OperatorPanel,{heading:"Public content",source:"provider:exact-id",inset:"flush-bottom"},h("a",{href:"/ask"},"Ask")))));`,
    ],
    { cwd: root, env: { ...process.env, NODE_ENV: "production" } },
  );
  expect(result.exitCode).toBe(0);
  const html = result.stdout.toString();
  expect(html).toContain("provider:exact-id");
  expect(html).toContain('href="/ask"');
  expect(html).not.toContain("<style");
});
