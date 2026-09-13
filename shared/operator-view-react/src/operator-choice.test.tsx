/** @jsxImportSource react */
import { expect, test } from "bun:test";
import { Window } from "happy-dom";
import { renderToStaticMarkup } from "react-dom/server";
import {
  OperatorChoiceGroup,
  OperatorChoiceButton,
  OperatorChoiceCount,
  OperatorChoiceLabel,
  OperatorChoiceTools,
  OperatorChoiceSearch,
  OperatorChoiceToggle,
  operatorViewStylexCSS,
} from "@brains/operator-view-react";
for (const width of [1440, 768, 390])
  test(`compiled choices preserve native state, hiding and targets at ${width}px`, async () => {
    const window = new Window({ width });
    try {
      const doc = window.document;
      doc.head.innerHTML = `<style>:root{--console-text:rgb(10,10,10);--console-text-faint:rgb(100,100,100);--console-warn:rgb(180,100,20)}${operatorViewStylexCSS}</style>`;
      doc.body.innerHTML = renderToStaticMarkup(
        <>
          <OperatorChoiceTools id="tools" hidden>
            <OperatorChoiceSearch id="search" aria-label="Search choices" />
            <OperatorChoiceToggle id="toggle" aria-expanded="false">
              Show all
            </OperatorChoiceToggle>
          </OperatorChoiceTools>
          <OperatorChoiceGroup id="choices" compact aria-label="Choices">
            <OperatorChoiceButton
              id="first"
              compact
              aria-pressed="true"
              data-ui-filter-value="exact:value"
            >
              <OperatorChoiceCount id="count" attention>
                0
              </OperatorChoiceCount>
              <OperatorChoiceLabel>Full &lt;source&gt;</OperatorChoiceLabel>
            </OperatorChoiceButton>
            <OperatorChoiceButton id="second" aria-selected="false" hidden>
              Second
            </OperatorChoiceButton>
          </OperatorChoiceGroup>
        </>,
      );
      function element(
        id: string,
      ): NonNullable<ReturnType<typeof doc.getElementById>> {
        const result = doc.getElementById(id);
        if (!result) throw Error(`Missing ${id}`);
        return result;
      }
      expect(window.getComputedStyle(element("tools")).display).toBe("none");
      expect(window.getComputedStyle(element("second")).display).toBe("none");
      element("tools").removeAttribute("hidden");
      element("second").removeAttribute("hidden");
      expect(window.getComputedStyle(element("tools")).display).toBe("flex");
      expect(window.getComputedStyle(element("second")).display).toBe(
        "inline-flex",
      );
      expect(window.getComputedStyle(element("first")).color).toBe(
        "rgb(10, 10, 10)",
      );
      expect(window.getComputedStyle(element("second")).color).toBe(
        "rgb(100, 100, 100)",
      );
      element("first").setAttribute("aria-pressed", "false");
      element("first").classList.add("is-active");
      element("second").setAttribute("aria-selected", "true");
      expect(window.getComputedStyle(element("first")).color).toBe(
        "rgb(100, 100, 100)",
      );
      expect(window.getComputedStyle(element("second")).color).toBe(
        "rgb(10, 10, 10)",
      );
      expect(element("first").getAttribute("data-ui-filter-value")).toBe(
        "exact:value",
      );
      expect(element("first").getAttribute("type")).toBe("button");
      expect(element("count").textContent).toBe("0");
      expect(window.getComputedStyle(element("count")).color).toBe(
        "rgb(180, 100, 20)",
      );
      expect(element("first").textContent).toBe("0Full <source>");
      expect(element("search").getAttribute("type")).toBe("search");
      expect(element("toggle").getAttribute("aria-expanded")).toBe("false");
      for (const id of ["first", "search", "toggle"])
        expect(
          Number.parseFloat(window.getComputedStyle(element(id)).minHeight),
        ).toBe(width <= 640 ? 44 : 0);
      expect(window.getComputedStyle(element("first")).paddingLeft).toBe("8px");
      expect(window.getComputedStyle(element("choices")).marginBottom).toBe(
        "12px",
      );
    } finally {
      await window.happyDOM.close();
    }
  });
