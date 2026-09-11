/** @jsxImportSource react */
import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { Window } from "happy-dom";
import {
  OperatorViewRenderer,
  operatorViewStylexCSS,
} from "@brains/operator-view-react";
for (const width of [1440, 768, 390])
  test(`compiled renderer layout preserves source text and responsive cells at ${width}px`, async () => {
    const window = new Window({ width });
    try {
      const doc = window.document;
      doc.head.innerHTML = `<style>${operatorViewStylexCSS}</style>`;
      doc.body.innerHTML = renderToStaticMarkup(
        <OperatorViewRenderer
          data={{
            view: {
              title: "Exact title α",
              kicker: "Exact kicker",
              description: "Description <source>",
              status: {
                label: "Queued (0)",
                detail: "Exact detail",
                tone: "warn",
              },
              blocks: [
                {
                  type: "matrix",
                  id: "matrix",
                  columns: 3,
                  cells: [
                    {
                      id: "a",
                      label: "Long".repeat(30),
                      items: [],
                      empty: "Exact empty",
                      tone: "error",
                    },
                  ],
                },
                {
                  type: "list",
                  id: "empty-collection",
                  items: [],
                  empty: "No records",
                },
                {
                  type: "links",
                  items: [
                    {
                      label: "Exact link",
                      target: {
                        kind: "external",
                        href: "https://example.com/path?a=1&b=2",
                      },
                    },
                  ],
                },
                {
                  type: "tabs",
                  id: "two-block-tab",
                  label: "Environment",
                  defaultTab: "current",
                  tabs: [
                    {
                      id: "current",
                      label: "Current",
                      blocks: [
                        { type: "notice", text: "Current exception" },
                        { type: "text", text: "Retained source" },
                      ],
                    },
                  ],
                },
              ],
            },
          }}
          onAction={async () => ({})}
          onOpenEntity={() => {}}
        />,
      );
      const tabBlocks = doc.querySelectorAll('[role="tabpanel"] > section');
      expect(tabBlocks.length).toBe(2);
      const first = tabBlocks[0],
        second = tabBlocks[1];
      if (!first || !second) throw Error("Missing tab blocks");
      expect(parseFloat(window.getComputedStyle(first).marginTop || "0")).toBe(
        0,
      );
      expect(window.getComputedStyle(second).marginTop).toBe("26px");
      const head = doc.querySelector("main > header"),
        grid = doc.querySelector('[data-block="matrix"] > div'),
        empty = doc.querySelector('[data-block="list"] p'),
        links = doc.querySelector("nav");
      if (!head || !grid || !empty || !links) throw Error("Missing layout");
      const title = head.querySelector("h2"),
        cellTitle = grid.querySelector("h3");
      if (!title || !cellTitle) throw Error("Missing captions");
      expect(title.textContent).toBe("Exact title α");
      expect(head.querySelector("strong")?.textContent).toBe(
        "Queued (0)Exact detail",
      );
      expect(window.getComputedStyle(title).fontSize).toBe(
        width <= 900 ? "27px" : "34px",
      );
      expect(window.getComputedStyle(title).overflowWrap).toBe("anywhere");
      expect(window.getComputedStyle(cellTitle).overflowWrap).toBe("anywhere");
      expect(cellTitle.textContent).toBe("Long".repeat(30));
      expect(empty.textContent).toBe("No records");
      expect(window.getComputedStyle(empty).paddingTop).toBe("18px");
      expect(links.querySelector("a")?.getAttribute("href")).toBe(
        "https://example.com/path?a=1&b=2",
      );
      const standalone = doc.querySelector("main");
      if (!standalone) throw Error("Missing frame");
      expect(window.getComputedStyle(standalone).paddingLeft).toBe(
        width <= 900 ? "18px" : "34px",
      );
      doc.body.innerHTML = renderToStaticMarkup(
        <OperatorViewRenderer
          renderHead={false}
          data={{ view: { title: "Host owns the head", blocks: [] } }}
          onAction={async () => ({})}
          onOpenEntity={() => {}}
        />,
      );
      const embedded = doc.querySelector("main");
      if (!embedded) throw Error("Missing embedded frame");
      const inset = window.getComputedStyle(embedded);
      for (const side of [
        inset.paddingTop,
        inset.paddingRight,
        inset.paddingBottom,
        inset.paddingLeft,
      ])
        expect(parseFloat(side)).toBe(0);
      expect(inset.overflowY).toBe("visible");
      // Chromium resolves dynamic grid tracks and structural :is() layout conditions.
    } finally {
      await window.happyDOM.close();
    }
  });
