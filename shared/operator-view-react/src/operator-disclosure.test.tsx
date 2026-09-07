/** @jsxImportSource react */
import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { Window } from "happy-dom";
import {
  OperatorDisclosure,
  operatorViewStylexCSS,
} from "@brains/operator-view-react";

test("row-action disclosures retain native state and bounded touch targets", async () => {
  for (const width of [1440, 768, 390]) {
    const window = new Window({ width });
    try {
      const doc = window.document;
      doc.head.innerHTML = `<style>${operatorViewStylexCSS}</style>`;
      doc.body.innerHTML = renderToStaticMarkup(
        <OperatorDisclosure
          triggerVariant="link"
          triggerLabel="Exact source options"
        >
          <button>Move up</button>
          <button disabled>Publish now</button>
        </OperatorDisclosure>,
      );
      const details = doc.querySelector("details"),
        summary = doc.querySelector("summary");
      if (!details || !summary) throw Error("Missing native action group");
      expect(summary.textContent).toBe("Exact source options");
      expect(details.hasAttribute("triggerVariant")).toBe(false);
      const css = window.getComputedStyle(summary);
      expect(css.listStyleType).toBe("none");
      expect(parseFloat(css.borderTopWidth)).toBe(0);
      expect(css.minHeight).toBe(width <= 640 ? "44px" : "32px");
      expect(css.fontSize).toBe("12px");
      expect(details.hasAttribute("open")).toBe(false);
      summary.click();
      expect(details.hasAttribute("open")).toBe(true);
      expect(details.querySelector("button[disabled]")?.textContent).toBe(
        "Publish now",
      );
      summary.click();
      expect(details.hasAttribute("open")).toBe(false);
    } finally {
      await window.happyDOM.close();
    }
  }
});

test("compiled disclosures preserve native structure, attributes, and independent open states", async () => {
  const html = renderToStaticMarkup(
    <OperatorDisclosure
      id="outer"
      className="host-disclosure"
      presentation="action"
      open
      triggerLabel="Full outer label"
      data-source-id="exact:source"
    >
      <OperatorDisclosure
        id="inner"
        presentation="action"
        triggerLabel="Inner label"
      >
        Exact &lt;diagnostics&gt;
      </OperatorDisclosure>
      <OperatorDisclosure id="plain" triggerLabel="Plain label">
        Plain content
      </OperatorDisclosure>
    </OperatorDisclosure>,
  );
  for (const width of [1440, 390]) {
    const window = new Window({ width });
    try {
      const doc = window.document;
      doc.head.innerHTML = `<style>${operatorViewStylexCSS}</style>`;
      doc.body.innerHTML = html;
      const outer = doc.getElementById("outer"),
        inner = doc.getElementById("inner"),
        plain = doc.getElementById("plain");
      if (!outer || !inner || !plain) throw Error("Missing disclosures");
      const summary = outer.querySelector("summary"),
        innerSummary = inner.querySelector("summary"),
        plainSummary = plain.querySelector("summary");
      if (!summary || !innerSummary || !plainSummary)
        throw Error("Missing native summaries");
      expect(outer.tagName).toBe("DETAILS");
      expect(outer.getAttribute("data-source-id")).toBe("exact:source");
      expect(outer.classList.contains("host-disclosure")).toBe(true);
      expect(outer.hasAttribute("presentation")).toBe(false);
      expect(summary.textContent).toBe("Full outer label");
      expect(inner.textContent).toContain("Exact <diagnostics>");
      // HappyDOM does not resolve this :is() child selector in computed styles.
      // Chromium checks open-state spacing and markers, including nested details.
      expect(outer.hasAttribute("open")).toBe(true);
      expect(inner.hasAttribute("open")).toBe(false);
      expect(
        Number.parseFloat(window.getComputedStyle(summary).minHeight),
      ).toBe(width === 390 ? 44 : 0);
      expect(plainSummary.className).toBe("");
      inner.setAttribute("open", "");
      expect(inner.hasAttribute("open")).toBe(true);
      outer.removeAttribute("open");
      expect(inner.hasAttribute("open")).toBe(true);
      expect(outer.hasAttribute("open")).toBe(false);
    } finally {
      await window.happyDOM.close();
    }
  }
  expect(operatorViewStylexCSS).not.toContain(".declarative-action-disclosure");
});
