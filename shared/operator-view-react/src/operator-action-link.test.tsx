/** @jsxImportSource react */
import { expect, test } from "bun:test";
import { Window } from "happy-dom";
import { renderToStaticMarkup } from "react-dom/server";
import {
  OperatorActionLinks,
  OperatorActionLink,
  operatorViewStylexCSS,
} from "@brains/operator-view-react";
for (const width of [1440, 768, 390])
  test(`compiled action links preserve native destinations and targets at ${width}px`, async () => {
    const window = new Window({ width });
    try {
      const doc = window.document;
      doc.head.innerHTML = `<style>:root{--console-accent:rgb(180,60,20);--console-text-dim:rgb(100,100,100)}${operatorViewStylexCSS}</style>`;
      const href = "/studio?source=a%2Fb&mode=review#exact";
      doc.body.innerHTML = renderToStaticMarkup(
        <OperatorActionLinks aria-label="Actions">
          <OperatorActionLink
            id="local"
            href={href}
            emphasis="primary"
            indicator="→"
          >
            Full &lt;source&gt;
          </OperatorActionLink>
          <OperatorActionLink
            id="external"
            href="https://preview.example/path?q=a%2Fb#section"
            target="_blank"
            rel="noreferrer"
            indicator="↗"
          >
            Preview
          </OperatorActionLink>
          <OperatorActionLink id="hidden" hidden href="/hidden">
            Hidden
          </OperatorActionLink>
        </OperatorActionLinks>,
      );
      const local = doc.getElementById("local"),
        external = doc.getElementById("external"),
        hidden = doc.getElementById("hidden");
      if (!local || !external || !hidden) throw Error("Missing action links");
      expect(local.tagName).toBe("A");
      expect(local.getAttribute("href")).toBe(href);
      expect(local.getAttribute("target")).toBeNull();
      expect(local.getAttribute("role")).toBeNull();
      expect(external.getAttribute("href")).toBe(
        "https://preview.example/path?q=a%2Fb#section",
      );
      expect(external.getAttribute("target")).toBe("_blank");
      expect(external.getAttribute("rel")).toBe("noreferrer");
      expect(local.textContent).toBe("Full <source>→");
      expect(
        external
          .querySelector("[data-action-indicator]")
          ?.getAttribute("aria-hidden"),
      ).toBe("true");
      expect(window.getComputedStyle(local).color).toBe("rgb(180, 60, 20)");
      expect(window.getComputedStyle(external).color).toBe(
        "rgb(100, 100, 100)",
      );
      expect(window.getComputedStyle(local).minHeight).toBe(
        width <= 640 ? "44px" : "36px",
      );
      expect(window.getComputedStyle(local).boxSizing).toBe("border-box");
      expect(window.getComputedStyle(hidden).display).toBe("none");
      expect(doc.querySelector("nav")?.getAttribute("aria-label")).toBe(
        "Actions",
      );
    } finally {
      await window.happyDOM.close();
    }
  });
