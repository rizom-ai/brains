/** @jsxImportSource react */
import { expect, test } from "bun:test";
import { Window } from "happy-dom";
import { renderToStaticMarkup } from "react-dom/server";
import {
  OperatorViewRenderer,
  operatorViewStylexCSS,
  type OperatorViewComponents,
} from "@brains/operator-view-react";

for (const density of ["compact", "comfortable"] as const) {
  for (const [presentation, size, family, weight] of [
    ["standard", "16px", "sans-serif", "500"],
    ["editorial", "20px", "serif", "400"],
    ["attention", "18px", "sans-serif", "700"],
    ["activity", "14px", "sans-serif", "500"],
  ] as const) {
    test(`${presentation} hierarchy reaches the shared ${density} host`, async () => {
      const window = new Window();
      try {
        const doc = window.document;
        doc.documentElement.style.cssText =
          "--console-ui:sans-serif;--console-display:serif;--console-mono:monospace";
        doc.head.innerHTML = `<style>${operatorViewStylexCSS}</style>`;
        // Deliberately use the same control engine for both densities.
        const components: OperatorViewComponents = {
          engine: "css",
          density,
          Button: () => null,
          Input: () => null,
          Select: () => null,
          ConfirmDialog: () => null,
          Disclosure: () => null,
          Tabs: () => null,
        };
        doc.body.innerHTML = renderToStaticMarkup(
          <OperatorViewRenderer
            components={components}
            renderHead={false}
            onAction={async () => ({})}
            onOpenEntity={() => {}}
            data={{
              view: {
                blocks: [
                  {
                    type: "list",
                    id: "any-provider",
                    empty: "Empty",
                    presentation,
                    items: [
                      {
                        id: "first",
                        title: "First record",
                        description: "Record description",
                        metadata: ["2026-09-05T13:19:25.792Z"],
                        link: {
                          kind: "external",
                          href: "https://example.com/",
                        },
                      },
                      { id: "second", title: "Second record" },
                    ],
                  },
                ],
              },
            }}
          />,
        );
        const title = doc.querySelector("strong");
        const link = doc.querySelector("strong a");
        if (!title || !link) throw new Error("Missing record title/link");
        const computed = window.getComputedStyle(title);
        expect(computed.fontSize).toBe(size);
        expect(computed.fontFamily).toBe(family);
        expect(computed.fontWeight).toBe(weight);
        // Happy DOM preserves the CSS-wide keyword instead of resolving inheritance.
        expect(window.getComputedStyle(link).fontSize).toBe("inherit");
        expect(window.getComputedStyle(link).fontFamily).toBe("inherit");
        const second = doc.querySelectorAll("strong")[1];
        if (presentation === "attention" && second)
          expect(window.getComputedStyle(second).fontWeight).toBe("500");
        const paragraph = doc.querySelector("p");
        if (!paragraph) throw new Error("Missing description");
        expect(window.getComputedStyle(paragraph).fontSize).toBe("12px");
        const time = doc.querySelector("time");
        if (!time) throw new Error("Missing semantic time");
        expect(window.getComputedStyle(time).fontSize).toBe("11px");
        expect(window.getComputedStyle(time).fontFamily).toBe("monospace");
        expect(time.getAttribute("datetime")).toBe("2026-09-05T13:19:25.792Z");
      } finally {
        await window.happyDOM.abort();
      }
    });
  }
}
