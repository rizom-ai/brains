/** @jsxImportSource react */
import { expect, test } from "bun:test";
import { Window } from "happy-dom";
import { renderToStaticMarkup } from "react-dom/server";
import * as stylex from "@stylexjs/stylex";
import { operatorViewStylexCSS } from "@brains/operator-view-react";
import { OperatorCard } from "./operator-card";
import { tableStyles } from "./operator-table.styles";

for (const hosted of [false, true]) {
  test(`operator heading roles ${hosted ? "accept host tokens" : "retain renderer defaults"}`, async () => {
    const window = new Window();
    try {
      const doc = window.document;
      doc.head.innerHTML = `<style>${operatorViewStylexCSS}</style>`;
      const root = doc.documentElement.style;
      root.setProperty("--console-ui", "Arial");
      root.setProperty("--console-display", "Georgia");
      root.setProperty("--console-mono", "monospace");
      if (hosted) {
        root.setProperty("--operator-secondary-size", "20px");
        root.setProperty("--operator-secondary-weight", "550");
        root.setProperty("--operator-secondary-leading", "1.25");
        root.setProperty("--operator-secondary-tracking", "-0.01em");
        root.setProperty("--operator-section-family", "Georgia");
        root.setProperty("--operator-section-size", "16px");
        root.setProperty("--operator-section-weight", "620");
        root.setProperty("--operator-eyebrow-size", "11px");
        root.setProperty("--operator-eyebrow-weight", "600");
        root.setProperty("--operator-eyebrow-tracking", "0.2em");
      }
      doc.body.innerHTML = renderToStaticMarkup(
        <>
          <div data-feature="">
            <OperatorCard
              density="comfortable"
              presentation="feature"
              label="Feature"
            >
              <p>Content</p>
            </OperatorCard>
          </div>
          <div data-comfortable="">
            <OperatorCard density="comfortable" label="Section">
              <p>Content</p>
            </OperatorCard>
          </div>
          <div data-compact="">
            <OperatorCard density="compact" label="Group">
              <p>Content</p>
            </OperatorCard>
          </div>
          <table>
            <thead>
              <tr>
                <th {...stylex.props(tableStyles.head)}>Column</th>
              </tr>
            </thead>
          </table>
        </>,
      );
      // Read the compiled declaration: Happy DOM resolves em tracking against
      // its base size, not the element's resolved variable font size.
      const trackingRules = [...doc.styleSheets]
        .flatMap((sheet) => [...sheet.cssRules])
        .filter((rule) => rule instanceof window.CSSStyleRule)
        .filter((rule) => rule.style.letterSpacing);
      const feature = doc.querySelector("[data-feature] header");
      if (!feature) throw new Error("Missing feature heading");
      const display = window.getComputedStyle(feature);
      expect(display.fontFamily).toBe("Georgia");
      expect(display.fontSize).toBe(hosted ? "20px" : "28px");
      expect(display.fontWeight).toBe(hosted ? "550" : "500");
      expect(display.lineHeight).toBe(hosted ? "1.25" : "1.3");
      expect(
        trackingRules
          .filter((rule) => feature.matches(rule.selectorText))
          .map((rule) => rule.style.letterSpacing.replaceAll(/\s/g, ""))
          .join(),
      ).toBe("var(--operator-secondary-tracking,0)");
      const section = doc.querySelector("[data-comfortable] header");
      if (!section) throw new Error("Missing section heading");
      const heading = window.getComputedStyle(section);
      expect(heading.fontFamily).toBe(hosted ? "Georgia" : "Arial");
      expect(heading.fontSize).toBe(hosted ? "16px" : "14px");
      expect(heading.fontWeight).toBe(hosted ? "620" : "700");
      for (const [selector, size] of [
        ["[data-compact] header", "9px"],
        ["th", "9.5px"],
      ] as const) {
        const label = doc.querySelector(selector);
        if (!label) throw new Error(`Missing ${selector}`);
        const font = window.getComputedStyle(label);
        expect(font.fontFamily).toBe("monospace");
        expect(font.fontSize).toBe(hosted ? "11px" : size);
        expect(font.fontWeight).toBe(hosted ? "600" : "500");
        expect(
          trackingRules
            .filter((rule) => label.matches(rule.selectorText))
            .map((rule) => rule.style.letterSpacing.replaceAll(/\s/g, ""))
            .join(),
        ).toMatch(/^var\(--operator-eyebrow-tracking,0?\.14em\)$/);
        expect(font.textTransform).toBe("uppercase");
      }
    } finally {
      await window.happyDOM.abort();
    }
  });
}
