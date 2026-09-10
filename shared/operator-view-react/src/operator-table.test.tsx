/** @jsxImportSource react */
import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { Window } from "happy-dom";
import {
  OperatorViewRenderer,
  operatorViewStylexCSS,
} from "@brains/operator-view-react";

test("compiled tables preserve cell hierarchy, alignment and source-authored compact rows", async () => {
  const html = renderToStaticMarkup(
    <OperatorViewRenderer
      data={{
        view: {
          blocks: [
            {
              type: "table",
              id: "rows",
              empty: "Empty",
              columns: [
                { key: "name", label: "Name" },
                { key: "count", label: "Count", align: "end" },
              ],
              rows: [
                {
                  id: "authored",
                  cells: { name: "Authored", count: 0 },
                  compact: { title: "Authored compact" },
                },
                { id: "plain", cells: { name: "Plain", count: false } },
              ],
            },
          ],
        },
      }}
      onAction={async () => ({})}
      onOpenEntity={() => {}}
    />,
  );
  for (const width of [1440, 390]) {
    const window = new Window({ width });
    try {
      const doc = window.document;
      doc.head.innerHTML = `<style>${operatorViewStylexCSS}</style>`;
      doc.body.innerHTML = html;
      const table = doc.querySelector("table"),
        compact = doc.querySelector(".declarative-compact-rows"),
        scroll = doc.querySelector(".declarative-table-scroll");
      if (!table || !compact || !scroll) throw Error("Missing table structure");
      const rows = Array.from(table.querySelectorAll("tbody tr"));
      const authored = rows[0],
        plain = rows[1];
      if (!authored || !plain) throw Error("Missing rows");
      const cells = Array.from(authored.querySelectorAll("td"));
      const first = cells[0],
        last = cells[1];
      if (!first || !last) throw Error("Missing cells");
      expect(last.textContent).toBe("0");
      expect(plain.textContent).toContain("No");
      expect(window.getComputedStyle(first).fontSize).toBe("14px");
      expect(window.getComputedStyle(last).fontSize).toBe("13px");
      expect(window.getComputedStyle(last).textAlign).toBe("right");
      expect(window.getComputedStyle(first).paddingRight).toBe("40px");
      expect(
        Number.parseFloat(window.getComputedStyle(last).paddingRight),
      ).toBe(0);
      expect(window.getComputedStyle(last).paddingLeft).toBe("20px");
      expect(window.getComputedStyle(compact).display).toBe(
        width === 390 ? "block" : "none",
      );
      expect(window.getComputedStyle(authored).display).toBe(
        width === 390 ? "none" : "table-row",
      );
      expect(window.getComputedStyle(plain).display).toBe("table-row");
      expect(window.getComputedStyle(scroll).display).toBe("block");
      scroll.setAttribute("data-has-unannotated", "false");
      expect(window.getComputedStyle(scroll).display).toBe(
        width === 390 ? "none" : "block",
      );
    } finally {
      await window.happyDOM.close();
    }
  }
});
