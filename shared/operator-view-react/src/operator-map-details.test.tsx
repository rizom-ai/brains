/** @jsxImportSource react */
import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { Window } from "happy-dom";
import {
  OperatorMapIndex,
  OperatorMapIndexItem,
  OperatorMapLegend,
  OperatorMapLegendItem,
  OperatorMapLegendNote,
  operatorViewStylexCSS,
} from "@brains/operator-view-react";

for (const width of [1440, 768, 390]) {
  test(`compiled map index and legend use native state at ${width}px`, async () => {
    const window = new Window({ width });
    try {
      const doc = window.document;
      doc.head.innerHTML = `<style>:root{--console-secondary:rgb(80,60,120);--console-secondary-soft:rgb(230,220,240)}${operatorViewStylexCSS}</style>`;
      doc.body.innerHTML = renderToStaticMarkup(
        <>
          <OperatorMapIndex
            id="index"
            heading="Regions"
            description="Source-owned ordering"
            remainder="+ 12 smaller regions"
            note="Focus a region to inspect it."
          >
            <OperatorMapIndexItem
              id="first"
              rank="01"
              label="Full source <script> label"
              count={0}
              aria-pressed="true"
              data-source-id="exact:id"
            />
            <OperatorMapIndexItem
              id="second"
              rank="02"
              label="Another region"
              count={21}
              aria-pressed="false"
            />
          </OperatorMapIndex>
          <OperatorMapLegend aria-label="Map legend">
            <OperatorMapLegendItem
              label="Topics"
              marker="dashed-ring"
              tone="secondary"
            />
            <OperatorMapLegendItem label="Published" marker="dot" tone="warn" />
            <OperatorMapLegendItem
              label="Sources"
              marker="ring"
              tone="neutral"
            />
            <OperatorMapLegendNote id="legend-note">
              21 sources · public scope
            </OperatorMapLegendNote>
          </OperatorMapLegend>
        </>,
      );
      const index = doc.getElementById("index"),
        first = doc.getElementById("first"),
        second = doc.getElementById("second"),
        note = doc.querySelector("[data-map-index-note]"),
        legendNote = doc.getElementById("legend-note");
      if (!index || !first || !second || !note || !legendNote)
        throw Error("Missing map details");
      expect(index.tagName).toBe("ASIDE");
      expect(index.querySelectorAll("ol > li > button")).toHaveLength(2);
      expect(first.getAttribute("type")).toBe("button");
      expect(first.getAttribute("data-source-id")).toBe("exact:id");
      expect(first.getAttribute("title")).toBe("Full source <script> label");
      expect(first.querySelector("strong")?.textContent).toBe(
        "Full source <script> label",
      );
      expect(first.querySelector("b")?.textContent).toBe("0");
      expect(window.getComputedStyle(first).minHeight).toBe(
        width <= 700 ? "44px" : "39px",
      );
      expect(window.getComputedStyle(first).borderLeftWidth).toBe("2px");
      expect(window.getComputedStyle(first).backgroundColor).toBe(
        "rgb(230, 220, 240)",
      );
      expect(window.getComputedStyle(second).backgroundColor).toBe(
        "transparent",
      );
      first.setAttribute("aria-pressed", "false");
      first.classList.add("is-active");
      second.setAttribute("aria-pressed", "true");
      expect(window.getComputedStyle(first).backgroundColor).toBe(
        "transparent",
      );
      expect(window.getComputedStyle(second).backgroundColor).toBe(
        "rgb(230, 220, 240)",
      );
      expect(window.getComputedStyle(index).display).toBe("flex");
      expect(window.getComputedStyle(note).position).not.toBe("absolute");
      expect(window.getComputedStyle(note).display).toBe(
        width <= 700 ? "none" : "block",
      );
      expect(
        index.querySelector("[data-map-index-remainder]")?.textContent,
      ).toBe("+ 12 smaller regions");
      expect(
        [...doc.querySelectorAll("[data-map-marker]")].map((el) =>
          el.getAttribute("data-map-marker"),
        ),
      ).toEqual(["dashed-ring", "dot", "ring"]);
      expect(
        doc.querySelectorAll('[data-map-marker] > [aria-hidden="true"]'),
      ).toHaveLength(3);
      expect(window.getComputedStyle(legendNote).flexBasis).toBe(
        width <= 700 ? "100%" : "auto",
      );
      expect(
        doc.body.querySelector("script,style,[style],[rank],[count],[label]"),
      ).toBeNull();
    } finally {
      await window.happyDOM.abort();
    }
  });
}

test("legend styles never infer categories from labels", () => {
  const html = renderToStaticMarkup(
    <OperatorMapLegendItem
      label="Approved skill topics <script>"
      marker="ring"
      tone="neutral"
    />,
  );
  expect(html).toContain('data-map-marker="ring"');
  expect(html).toContain('data-tone="neutral"');
  expect(html).toContain("&lt;script&gt;");
  expect(html).not.toContain("data-kind");
});

test("map detail components render production SSR without a DOM or runtime compiler", () => {
  const entry = new URL("../dist/index.js", import.meta.url).pathname;
  const result = Bun.spawnSync(
    [
      process.execPath,
      "-e",
      `import {createElement as h} from 'react';import {renderToStaticMarkup} from 'react-dom/server';import * as ui from ${JSON.stringify(entry)};console.log(renderToStaticMarkup(h('main',{},h(ui.OperatorMapIndex,{heading:'Regions',description:'Source data',remainder:'+ 12 regions',note:'Exact note'},h(ui.OperatorMapIndexItem,{rank:'01',label:'Exact source label',count:0,'aria-pressed':'true'})),h(ui.OperatorMapLegend,{'aria-label':'Legend'},h(ui.OperatorMapLegendItem,{label:'Sources',marker:'ring',tone:'neutral'}),h(ui.OperatorMapLegendNote,{},'Public scope')))));`,
    ],
    {
      cwd: new URL("../../../", import.meta.url).pathname,
      env: { ...process.env, NODE_ENV: "production" },
    },
  );
  expect(result.exitCode).toBe(0);
  const html = result.stdout.toString();
  expect(html).toContain('aria-pressed="true"');
  expect(html).toContain("Exact source label");
  expect(html).toContain("Exact note");
  expect(html).not.toContain("<style");
});
