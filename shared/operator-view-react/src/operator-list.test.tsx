/** @jsxImportSource react */
import { test, expect } from "bun:test";
import { Window } from "happy-dom";
import { renderToStaticMarkup } from "react-dom/server";
import { operatorViewStylexCSS } from "@brains/operator-view-react";
import {
  OperatorList,
  OperatorRecordRow,
  OperatorBadge,
} from "./operator-list";
import { OperatorRecordCopy, OperatorTextLink } from "./operator-record";
for (const density of ["comfortable", "compact"] as const) {
  test(`compiled ${density} records keep badges bounded and historic failures quiet`, async () => {
    const window = new Window({ width: 1440 });
    try {
      const doc = window.document;
      doc.head.innerHTML = `<style>${operatorViewStylexCSS}</style>`;
      const long = "source/".repeat(40);
      doc.body.innerHTML = renderToStaticMarkup(
        <OperatorList density={density} presentation="editorial">
          <OperatorRecordRow
            density={density}
            tone="error"
            master
            interactive
            trailing={
              <OperatorBadge density={density} tone="error">
                {long}
              </OperatorBadge>
            }
          >
            <OperatorRecordCopy
              density={density}
              presentation="editorial"
              title={
                <OperatorTextLink emphasis="title" stretch onClick={() => {}}>
                  Manual sync · failed
                </OperatorTextLink>
              }
              description={long}
              metadata={["Imported: 0", "Completed: 2026-09-05T09:15:00.000Z"]}
            />
          </OperatorRecordRow>
        </OperatorList>,
      );
      const row = doc.querySelector("li"),
        badge = doc.querySelector("[data-record-badge]"),
        title = doc.querySelector("strong"),
        trailing = doc.querySelector("[data-record-trailing]");
      if (!row || !badge || !title || !trailing)
        throw new Error("Record structure missing");
      expect(window.getComputedStyle(row).paddingTop).toBe(
        density === "comfortable" ? "22px" : "13px",
      );
      expect(window.getComputedStyle(row).boxShadow).not.toContain("inset");
      expect(badge.textContent).toBe(long);
      expect(window.getComputedStyle(badge).maxWidth).toBe("100%");
      expect(window.getComputedStyle(badge).overflowWrap).toBe("anywhere");
      expect(window.getComputedStyle(trailing).maxWidth).toBe("40%");
      expect(window.getComputedStyle(trailing).zIndex).toBe("1");
      expect(window.getComputedStyle(title).fontSize).toBe("20px");
      expect(doc.querySelector("time")?.dateTime).toBe(
        "2026-09-05T09:15:00.000Z",
      );
      expect(doc.body.querySelector("style")).toBeNull();
    } finally {
      await window.happyDOM.abort();
    }
  });
}
