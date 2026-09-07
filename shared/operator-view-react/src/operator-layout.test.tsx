/** @jsxImportSource react */
import { test, expect } from "bun:test";
import { Window } from "happy-dom";
import { renderToStaticMarkup } from "react-dom/server";
import { operatorViewStylexCSS } from "@brains/operator-view-react";
import { OperatorCard } from "./operator-card";
import { OperatorColumns } from "./operator-columns";
import { OperatorRecordCopy, OperatorTextLink } from "./operator-record";

for (const density of ["compact", "comfortable"] as const) {
  test(`shared ${density} attention disclosure retains diagnostics without exposing controls at rest`, async () => {
    const window = new Window();
    try {
      window.document.head.innerHTML = `<style>${operatorViewStylexCSS}</style>`;
      window.document.body.innerHTML = renderToStaticMarkup(
        <OperatorCard
          density={density}
          presentation="disclosure"
          tone="warn"
          label="One delivery needs attention"
          metadata={["Field notes · Retries: 1"]}
          footer={<button>Retry publication</button>}
        >
          <p>Retained diagnostic &lt;script&gt;unsafe&lt;/script&gt;</p>
        </OperatorCard>,
      );
      const details = window.document.querySelector("details");
      const summary = details?.querySelector("summary");
      if (!details || !summary) throw new Error("Missing attention disclosure");
      expect(details.open).toBe(false);
      expect(summary.textContent).toContain("Field notes · Retries: 1");
      expect(window.getComputedStyle(summary).fontSize).toBe(
        density === "comfortable" ? "18px" : "13px",
      );
      expect(summary.querySelector("button")).toBeNull();
      expect(
        details.querySelector("[data-card-controls] button")?.textContent,
      ).toBe("Retry publication");
      expect(details.textContent).toContain(
        "Retained diagnostic <script>unsafe</script>",
      );
      expect(details.querySelector("script")).toBeNull();
    } finally {
      await window.happyDOM.abort();
    }
  });
  test(`shared ${density} feature gives the primary state a clear heading without runtime CSS`, async () => {
    const window = new Window();
    try {
      window.document.head.innerHTML = `<style>${operatorViewStylexCSS}</style>`;
      window.document.body.innerHTML = renderToStaticMarkup(
        <OperatorCard
          density={density}
          presentation="feature"
          label="Published"
          metadata={["Preview"]}
        >
          <p>Generation 2026-09-05</p>
        </OperatorCard>,
      );
      const heading = window.document.querySelector("header"),
        card = window.document.querySelector("section");
      if (!heading || !card) throw new Error("Missing featured state");
      expect(heading.querySelector("h2")?.textContent).toBe("Published");
      expect(heading.textContent).toContain("Preview");
      expect(window.getComputedStyle(heading).fontSize).toBe("28px");
      expect(window.getComputedStyle(card).padding).toBe("24px");
      expect(window.document.body.querySelector("style")).toBeNull();
    } finally {
      await window.happyDOM.abort();
    }
  });
  test(`shared ${density} layout retains disclosure content and authored text`, async () => {
    const window = new Window();
    try {
      const doc = window.document;
      doc.head.innerHTML = `<style>${operatorViewStylexCSS}</style>`;
      const text = "long/provider/path/".repeat(30);
      doc.body.innerHTML = renderToStaticMarkup(
        <OperatorColumns
          density={density}
          primary={
            <OperatorRecordCopy
              density={density}
              title={
                <OperatorTextLink
                  href="/studio"
                  external={false}
                  emphasis="title"
                >
                  {text}
                </OperatorTextLink>
              }
              description={text}
              metadata={["Completed: 2026-09-05T13:19:25.792Z", text]}
            />
          }
          aside={
            <OperatorCard
              density={density}
              label="Repository details"
              presentation="disclosure"
            >
              <p>Full retained diagnostics</p>
            </OperatorCard>
          }
        />,
      );
      const columns = doc.querySelector(".declarative-columns");
      const details = doc.querySelector("details");
      if (!columns || !details) throw new Error("Missing semantic layout");
      expect(window.getComputedStyle(columns).display).toBe("grid");
      expect(details.open).toBe(false);
      expect(details.querySelector("summary")?.textContent).toBe(
        "Repository details",
      );
      expect(details.textContent).toContain("Full retained diagnostics");
      const summary = details.querySelector("summary");
      if (!summary) throw new Error("Missing disclosure trigger");
      if (density === "comfortable") {
        expect(window.getComputedStyle(summary).minHeight).toBe("48px");
        expect(window.getComputedStyle(summary).padding).toBe("16px 0px");
        expect(window.getComputedStyle(details).borderBottomWidth).toBe("1px");
      }
      for (const element of doc.querySelectorAll(
        "strong,strong a,.declarative-column:first-child p,small",
      ))
        expect(window.getComputedStyle(element).overflowWrap).toBe("anywhere");
      expect(doc.querySelector("time")?.getAttribute("datetime")).toBe(
        "2026-09-05T13:19:25.792Z",
      );
      expect(doc.querySelector("time")?.textContent).not.toContain(
        "2026-09-05T",
      );
      expect(doc.querySelector("a")?.getAttribute("href")).toBe("/studio");
      expect(doc.body.querySelector("style")).toBeNull();
    } finally {
      await window.happyDOM.abort();
    }
  });
}
