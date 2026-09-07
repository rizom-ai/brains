/** @jsxImportSource react */
import { expect, test } from "bun:test";
import { operatorViewStylexCSS } from "@brains/operator-view-react";
import { Window } from "happy-dom";
import { renderToStaticMarkup } from "react-dom/server";
import { OperatorNotice } from "./operator-notice";
import { OperatorSource } from "./operator-source";

for (const [tone, color] of [
  ["neutral", "rgb(1, 2, 3)"],
  ["good", "rgb(4, 5, 6)"],
  ["warn", "rgb(7, 8, 9)"],
  ["error", "rgb(10, 11, 12)"],
] as const) {
  for (const density of ["compact", "comfortable"] as const)
    test(`compiled ${density} ${tone} notices preserve warnings and line breaks`, async () => {
      const window = new Window();
      try {
        const doc = window.document;
        doc.documentElement.style.cssText =
          "--console-text-muted:rgb(1, 2, 3);--console-ok:rgb(4, 5, 6);--console-warn:rgb(7, 8, 9);--console-err:rgb(10, 11, 12);";
        doc.head.innerHTML = `<style>${operatorViewStylexCSS}</style>`;
        const text =
          "First failure\n\nSecond <script>failure</script>\n" +
          "path/".repeat(80);
        doc.body.innerHTML = renderToStaticMarkup(
          <OperatorNotice
            title="Attention <required>"
            tone={tone}
            density={density}
            text={text}
          >
            <OperatorSource text={text} density={density} framed={false} />
          </OperatorNotice>,
        );
        expect(doc.querySelector("strong")?.textContent).toBe(
          "Attention <required>",
        );
        expect(doc.querySelector("p")?.textContent).toBe(text);
        expect(doc.body.querySelector("script, style")).toBeNull();
        const notice = doc.querySelector("aside");
        const paragraph = doc.querySelector("p");
        const title = doc.querySelector("strong");
        const source = doc.querySelector("pre");
        if (!notice || !paragraph || !title || !source)
          throw new Error("Missing notice content");
        expect(window.getComputedStyle(title).fontSize).toBe(
          density === "compact" ? "13px" : "18px",
        );
        expect(window.getComputedStyle(paragraph).fontSize).toBe(
          density === "compact" ? "12.5px" : "12px",
        );
        const frame = window.getComputedStyle(notice);
        expect(parseFloat(frame.borderTopWidth)).toBe(0);
        expect(parseFloat(frame.borderRightWidth)).toBe(0);
        expect(parseFloat(frame.borderBottomWidth)).toBe(0);
        expect(parseFloat(frame.borderLeftWidth)).toBe(2);
        expect(parseFloat(frame.borderRadius)).toBe(0);
        expect(parseFloat(frame.paddingLeft)).toBe(
          density === "compact" ? 14 : 20,
        );
        expect(parseFloat(frame.paddingRight)).toBe(
          density === "compact" ? 14 : 0,
        );
        expect(notice.classList.contains("operator-notice")).toBe(false);
        expect(source.textContent).toBe(text);
        expect(window.getComputedStyle(source).whiteSpace).toBe("pre-wrap");
        expect(window.getComputedStyle(source).overflowWrap).toBe("anywhere");
        expect(notice.dataset["tone"]).toBe(tone);
        expect(window.getComputedStyle(notice).borderLeftColor).toBe(color);
        expect(window.getComputedStyle(paragraph).whiteSpace).toBe("pre-line");
        expect(window.getComputedStyle(paragraph).overflowWrap).toBe(
          "anywhere",
        );
      } finally {
        await window.happyDOM.abort();
      }
    });
}

test("untitled notices retain exact copy without a phantom caption gap", async () => {
  const window = new Window();
  try {
    window.document.head.innerHTML = `<style>${operatorViewStylexCSS}</style>`;
    window.document.body.innerHTML = renderToStaticMarkup(
      <OperatorNotice
        tone="neutral"
        density="compact"
        text="Exact untitled notice"
      />,
    );
    expect(window.document.querySelector("strong")).toBeNull();
    const paragraph = window.document.querySelector("p");
    if (!paragraph) throw Error("Missing notice copy");
    expect(paragraph.textContent).toBe("Exact untitled notice");
    expect(parseFloat(window.getComputedStyle(paragraph).marginTop)).toBe(0);
  } finally {
    await window.happyDOM.close();
  }
});
