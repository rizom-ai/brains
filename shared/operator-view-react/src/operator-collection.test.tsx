/** @jsxImportSource react */
import { test, expect } from "bun:test";
import { Window } from "happy-dom";
import { renderToStaticMarkup } from "react-dom/server";
import {
  OperatorViewRenderer,
  operatorViewStylexCSS,
} from "@brains/operator-view-react";
import { OperatorStats } from "./operator-stats";
for (const width of [1440, 390]) {
  test(`compiled collection layout preserves totals and drill-down at ${width}px`, async () => {
    const window = new Window({ width });
    try {
      const doc = window.document;
      doc.head.innerHTML = `<style>${operatorViewStylexCSS}</style>`;
      doc.body.innerHTML = renderToStaticMarkup(
        <>
          <OperatorStats
            density="comfortable"
            items={[
              { label: "Open", value: 3 },
              {
                label: "High priority",
                value: 1,
                tone: "warn",
                caption: "Needs review",
              },
            ]}
          />
          <OperatorViewRenderer
            data={{
              view: {
                blocks: [
                  {
                    type: "detail",
                    id: "items",
                    queryKey: "item",
                    empty: "Choose an item",
                    master: {
                      type: "list",
                      id: "master",
                      empty: "No items",
                      items: [{ id: "one", title: "Collaboration request" }],
                    },
                    open: {
                      forId: "one",
                      title: "Collaboration request",
                      blocks: [{ type: "text", text: "Complete source" }],
                    },
                  },
                ],
              },
            }}
            query={{ item: "one" }}
            onAction={async () => {}}
            onOpenEntity={() => {}}
          />
        </>,
      );
      const totals = doc.querySelector("dl"),
        master = doc.querySelector(".declarative-detail-master"),
        pane = doc.querySelector(".declarative-detail-pane"),
        back = doc.querySelector(".declarative-detail-back");
      if (!totals || !master || !pane || !back)
        throw new Error("Missing collection parts");
      expect(window.getComputedStyle(totals).display).toBe("flex");
      expect(totals.querySelectorAll("dt")).toHaveLength(2);
      expect(totals.textContent).toContain("Needs review");
      expect(pane.textContent).toContain("Complete source");
      expect(pane.querySelector("h2")?.tabIndex).toBe(-1);
      expect(window.getComputedStyle(back).display).toBe(
        width === 390 ? "inline-flex" : "none",
      );
      expect(window.getComputedStyle(master).display === "none").toBe(
        width === 390,
      );
    } finally {
      await window.happyDOM.abort();
    }
  });
}
