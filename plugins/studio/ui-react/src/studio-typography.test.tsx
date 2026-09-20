/** @jsxImportSource react */
import { expect, test } from "bun:test";
import { Window } from "happy-dom";
import { renderToStaticMarkup } from "react-dom/server";
import * as stylex from "@stylexjs/stylex";
import { OperatorCard } from "@brains/operator-view-react";
import { AccountDetailSection } from "./account/account-primitives";
import { PublicationActions } from "./publication-actions";
import { StudioMarkdown } from "./studio-markdown";
import { typographyStyles as typography } from "./studio-typography.styles";
import { workspaceClassName } from "./studio-workspace.styles";

import { readStudioStylesheet } from "../../test/ui-asset-fixture";
const css = await readStudioStylesheet();

for (const width of [1440, 768, 390]) {
  test(`compiled Studio type roles remain consistent at ${width}px`, async () => {
    const window = new Window({ width });
    try {
      const doc = window.document;
      doc.head.innerHTML = `<style>${css}</style>`;
      doc.documentElement.style.setProperty("--console-display", "Georgia");
      doc.documentElement.style.setProperty("--console-ui", "Arial");
      doc.documentElement.style.setProperty("--console-mono", "monospace");
      doc.body.innerHTML = renderToStaticMarkup(
        <div className={workspaceClassName("type-fixture")}>
          <h2 data-secondary="" {...stylex.props(typography.secondaryDisplay)}>
            Conversation or account name
          </h2>
          <h3 data-section="" {...stylex.props(typography.section)}>
            Sessions
          </h3>
          <AccountDetailSection title="Credentials">
            <p>Retained account content.</p>
          </AccountDetailSection>
          <div data-feature="">
            <OperatorCard
              label="Featured work"
              density="comfortable"
              presentation="feature"
            >
              <p>Retained feature content.</p>
            </OperatorCard>
          </div>
          <div data-comfortable="">
            <OperatorCard label="Publishing" density="comfortable">
              <p>Retained workspace content.</p>
            </OperatorCard>
          </div>
          <div data-compact="">
            <OperatorCard label="Delivery" density="compact">
              <p>Retained compact content.</p>
            </OperatorCard>
          </div>
          <PublicationActions
            entityType="note"
            entityId="example"
            title="Example"
            status="draft"
            unsaved={false}
            onAction={() => Promise.reject(new Error("Read-only fixture"))}
          />
          <StudioMarkdown>
            {"| Entity group | State |\n| --- | --- |\n| Notes | Draft |"}
          </StudioMarkdown>
        </div>,
      );
      const secondary = doc.querySelectorAll(
        "[data-secondary], [data-feature] header",
      );
      expect(secondary.length).toBe(2);
      for (const title of secondary) {
        const display = window.getComputedStyle(title);
        expect(display.fontFamily).toBe("Georgia");
        expect(display.fontSize).toBe("24px");
        expect(display.fontWeight).toBe("500");
        expect(display.lineHeight).toBe("1.2");
      }

      const sections = doc.querySelectorAll(
        "[data-section], .account-section-label h3, [data-comfortable] header",
      );
      expect(sections.length).toBe(3);
      for (const heading of sections) {
        const font = window.getComputedStyle(heading);
        // Happy DOM resolves the hosted font alias only once.
        expect(font.fontFamily).toBe(
          heading.matches("[data-comfortable] header")
            ? "var(--console-ui)"
            : "Arial",
        );
        expect(font.fontSize).toBe("14px");
        expect(font.fontWeight).toBe("650");
      }
      // Assert the actual compiled tracking rule; native browser checks resolve
      // its em length against the rendered font rather than Happy DOM's base size.
      const trackingRules = [...doc.styleSheets]
        .flatMap((sheet) => [...sheet.cssRules])
        .filter((rule) => rule instanceof window.CSSStyleRule)
        .filter((rule) => rule.style.letterSpacing);
      const eyebrows = doc.querySelectorAll(
        '[data-compact] header, [aria-label="Publication actions"] header, th',
      );
      expect(eyebrows.length).toBe(4);
      const host = doc.querySelector(".type-fixture");
      if (!host) throw new Error("Missing type role host");
      expect(
        window
          .getComputedStyle(host)
          .getPropertyValue("--operator-eyebrow-tracking"),
      ).toMatch(/^0?\.12em$/);
      for (const label of eyebrows) {
        const font = window.getComputedStyle(label);
        expect(font.fontFamily).toBe("monospace");
        expect(font.fontSize).toBe("10px");
        expect(font.fontWeight).toBe("600");
        const tracking = trackingRules
          .filter((rule) => label.matches(rule.selectorText))
          .map((rule) => rule.style.letterSpacing.replaceAll(/\s/g, ""));
        expect(tracking.length).toBeGreaterThan(0);
        for (const declaration of tracking) {
          expect(declaration).toMatch(
            /^(?:0?\.12em|var\(--operator-eyebrow-tracking,0?\.14em\))$/,
          );
        }
        expect(font.textTransform).toBe("uppercase");
      }
      const state = doc.querySelector('[aria-label="Publication actions"] b');
      if (!state) throw new Error("Missing publication state");
      // Happy DOM retains explicit inherit; the browser audit checks its resolved weight.
      expect(window.getComputedStyle(state).fontWeight).toBe("inherit");
      expect(doc.body.querySelector("style")).toBeNull();
    } finally {
      await window.happyDOM.abort();
    }
  });
}
