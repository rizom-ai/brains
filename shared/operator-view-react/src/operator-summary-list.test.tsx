/** @jsxImportSource react */
import { expect, test } from "bun:test";
import { Window } from "happy-dom";
import { renderToStaticMarkup } from "react-dom/server";
import {
  OperatorSummaryList,
  OperatorSummaryItem,
  OperatorSummaryMetadata,
  OperatorSummarySeparator,
  OperatorSummaryTags,
  OperatorSummaryTag,
  OperatorStatusPill,
  operatorViewStylexCSS,
} from "@brains/operator-view-react";
for (const width of [1440, 768, 390])
  test(`compiled summary rows preserve full content, native filtering and status at ${width}px`, async () => {
    const window = new Window({ width });
    try {
      const doc = window.document;
      doc.head.innerHTML = `<style>:root{--console-text-muted:rgb(120,120,120);--console-text-faint:rgb(180,180,180);--console-warn:rgb(200,140,30);--console-err:rgb(200,30,30);--console-ok:rgb(30,140,70)}${operatorViewStylexCSS}</style>`;
      doc.body.innerHTML = renderToStaticMarkup(
        <>
          <OperatorSummaryList id="list">
            <OperatorSummaryItem
              id="first"
              heading="Full <source> heading"
              description="Exact description"
              data-ui-filter-values='["exact:id"]'
              metadata={
                <OperatorSummaryMetadata id="metadata">
                  <time dateTime="2026-09-09T01:02:03Z">
                    2026-09-09T01:02:03Z
                  </time>
                  <OperatorSummarySeparator>·</OperatorSummarySeparator>
                  exact:identifier
                </OperatorSummaryMetadata>
              }
              tags={
                <OperatorSummaryTags>
                  <OperatorSummaryTag>
                    Full Tag &lt;source&gt;
                  </OperatorSummaryTag>
                </OperatorSummaryTags>
              }
              trailing={
                <OperatorStatusPill tone="warn" presentation="label">
                  Exact status
                </OperatorStatusPill>
              }
            />
            <OperatorSummaryItem
              id="zero"
              hidden
              heading={0}
              description={0}
              trailing={0}
            />
          </OperatorSummaryList>
          {(["neutral", "muted", "warn", "error", "good"] as const).map(
            (tone) => (
              <OperatorStatusPill
                key={tone}
                id={tone}
                presentation="label"
                tone={tone}
              >
                {tone}
              </OperatorStatusPill>
            ),
          )}
        </>,
      );
      function element(
        id: string,
      ): NonNullable<ReturnType<typeof doc.getElementById>> {
        const result = doc.getElementById(id);
        if (!result) throw Error(`Missing ${id}`);
        return result;
      }
      const first = element("first"),
        zero = element("zero"),
        heading = first.querySelector("[data-summary-heading]"),
        description = first.querySelector("[data-summary-description]");
      if (!heading || !description) throw Error("Missing copy slots");
      expect(element("list").tagName).toBe("UL");
      expect(first.tagName).toBe("LI");
      expect(first.getAttribute("data-ui-filter-values")).toBe('["exact:id"]');
      expect(heading.getAttribute("title")).toBe("Full <source> heading");
      expect(heading.textContent).toBe("Full <source> heading");
      expect(window.getComputedStyle(heading).fontSize).toBe("16px");
      expect(window.getComputedStyle(heading).fontWeight).toBe("500");
      expect(window.getComputedStyle(heading).whiteSpace).toBe(
        width <= 640 ? "normal" : "nowrap",
      );
      expect(window.getComputedStyle(description).fontSize).toBe("12px");
      expect(window.getComputedStyle(element("metadata")).fontSize).toBe(
        "11px",
      );
      expect(element("metadata").textContent).toBe(
        "2026-09-09T01:02:03Z·exact:identifier",
      );
      expect(first.textContent).toContain("Full Tag <source>");
      expect(
        Number.parseFloat(window.getComputedStyle(first).borderTopWidth),
      ).toBe(0);
      expect(window.getComputedStyle(zero).display).toBe("none");
      zero.removeAttribute("hidden");
      expect(window.getComputedStyle(zero).display).toBe("grid");
      expect(zero.querySelector("[data-summary-heading]")?.textContent).toBe(
        "0",
      );
      expect(
        zero.querySelector("[data-summary-description]")?.textContent,
      ).toBe("0");
      expect(zero.querySelector("[data-summary-trailing]")?.textContent).toBe(
        "0",
      );
      for (const [tone, color] of [
        ["neutral", "rgb(120, 120, 120)"],
        ["muted", "rgb(180, 180, 180)"],
        ["warn", "rgb(200, 140, 30)"],
        ["error", "rgb(200, 30, 30)"],
        ["good", "rgb(30, 140, 70)"],
      ] as const) {
        expect(window.getComputedStyle(element(tone)).color).toBe(color);
        expect(window.getComputedStyle(element(tone)).fontSize).toBe("9.5px");
        expect(window.getComputedStyle(element(tone)).borderRadius).toBe("2px");
      }
      expect(doc.querySelector("script")).toBeNull();
    } finally {
      await window.happyDOM.close();
    }
  });
