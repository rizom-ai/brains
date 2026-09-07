/** @jsxImportSource react */
import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { Window } from "happy-dom";
import {
  OperatorPage,
  OperatorFrame,
  OperatorCanvas,
  OperatorSections,
  OperatorSection,
  OperatorSectionHeading,
  OperatorFooter,
  OperatorFooterLink,
  operatorViewStylexCSS,
} from "@brains/operator-view-react";

const frame = (
  <OperatorPage className="host-page" aria-label="Public dashboard">
    <OperatorFrame data-ui-tabs-root="sections" id="frame">
      <OperatorCanvas id="canvas">
        <OperatorSections id="sections">
          <OperatorSection
            id="knowledge"
            role="tabpanel"
            aria-labelledby="knowledge-tab"
            data-ui-panel="knowledge"
          >
            <OperatorSectionHeading>Knowledge</OperatorSectionHeading>
            <p>Public topics</p>
          </OperatorSection>
        </OperatorSections>
        <OperatorFooter mark={"Rover <collective> · dashboard"}>
          <span>Runs on Brains · alpha.354</span>
          <OperatorFooterLink
            className="host-docs"
            href="/docs"
            target="_blank"
            rel="noopener noreferrer"
          >
            Open source ↗
          </OperatorFooterLink>
          <OperatorFooterLink href="/studio">
            Operators → Studio
          </OperatorFooterLink>
        </OperatorFooter>
      </OperatorCanvas>
    </OperatorFrame>
  </OperatorPage>
);

for (const width of [1440, 768, 390]) {
  for (const climate of ["paper", "instrument"]) {
    test(`compiled frame and footer preserve responsive geometry at ${width}px in ${climate}`, async () => {
      const window = new Window({ width });
      try {
        const document = window.document;
        document.documentElement.setAttribute("data-climate", climate);
        document.head.innerHTML = `<style>${operatorViewStylexCSS}</style>`;
        document.body.innerHTML = renderToStaticMarkup(frame);
        const surface = document.getElementById("frame");
        const canvas = document.getElementById("canvas");
        const sections = document.getElementById("sections");
        const footer = document.querySelector("footer");
        if (!surface || !canvas || !sections || !footer)
          throw new Error("Missing shared frame");
        const style = window.getComputedStyle(surface);
        expect(style.minHeight).toBe("560px");
        expect(style.borderLeftWidth).toBe(width <= 640 ? "0px" : "1px");
        expect(style.borderTopWidth).toBe("1px");
        expect(window.getComputedStyle(canvas).paddingLeft).toBe(
          width <= 640 ? "14px" : "26px",
        );
        expect(window.getComputedStyle(sections).gap).toBe(
          width <= 640 ? "24px" : "42px",
        );
        expect(window.getComputedStyle(footer).marginTop).toBe("32px");
        expect(window.getComputedStyle(footer).flexDirection).toBe(
          width <= 700 ? "column" : "row",
        );
        if (width <= 640) {
          expect(style.boxShadow).toBe("none");
          for (const link of footer.querySelectorAll("a"))
            expect(window.getComputedStyle(link).minHeight).toBe("44px");
        }
        // Happy DOM cannot match ancestor combinators inside :is(). The real
        // browser checks the climate shadow and enhanced section headings.
        expect(
          document.querySelector("main")?.classList.contains("host-page"),
        ).toBe(true);
        expect(document.querySelector(".host-docs")?.getAttribute("href")).toBe(
          "/docs",
        );
        expect(footer.querySelector("a")?.getAttribute("rel")).toBe(
          "noopener noreferrer",
        );
        expect(
          [...footer.querySelectorAll("a")].map((link) =>
            link.getAttribute("href"),
          ),
        ).toEqual(["/docs", "/studio"]);
        expect(footer.textContent).toContain("Rover <collective> · dashboard");
        expect(document.body.querySelector("style,collective")).toBeNull();
      } finally {
        await window.happyDOM.abort();
      }
    });
  }
}

test("native sections retain headings, labels, and attribute-controlled panel visibility", async () => {
  const window = new Window();
  try {
    const document = window.document;
    document.head.innerHTML = `<style>${operatorViewStylexCSS}</style>`;
    document.body.innerHTML = renderToStaticMarkup(frame);
    const root = document.getElementById("frame");
    const panel = document.getElementById("knowledge");
    const heading = panel?.querySelector("header");
    if (!root || !panel || !heading) throw new Error("Missing native section");
    expect(panel.hasAttribute("hidden")).toBe(false);
    expect(window.getComputedStyle(panel).display).toBe("block");
    expect(window.getComputedStyle(heading).display).toBe("block");
    expect(operatorViewStylexCSS).toMatch(
      /data-ui-tabs-active[^{}]+\{display:none\}/,
    );
    panel.setAttribute("hidden", "");
    expect(window.getComputedStyle(panel).display).toBe("none");
    panel.removeAttribute("hidden");
    expect(window.getComputedStyle(panel).display).toBe("block");
    expect(panel.getAttribute("aria-labelledby")).toBe("knowledge-tab");
  } finally {
    await window.happyDOM.abort();
  }
});

test("the embed pass ships exactly the collected stylesheet without compiler globals", async () => {
  const css = await Bun.file(
    new URL("../dist/stylex.css", import.meta.url),
  ).text();
  const js = await Bun.file(
    new URL("../dist/index.js", import.meta.url),
  ).text();
  expect(css.trimEnd()).toBe(operatorViewStylexCSS.trimEnd());
  expect(js).not.toContain("__OPERATOR_STYLEX_CSS__");
  expect(js).not.toContain("stylex.create(");
  expect(renderToStaticMarkup(frame)).not.toContain("style=");
});
