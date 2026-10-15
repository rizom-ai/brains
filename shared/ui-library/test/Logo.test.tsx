import { describe, expect, it } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { Logo } from "../src/Logo";

/** The markup between an SVG's opening and closing tags. */
function svgBodies(markup: string): string[] {
  return Array.from(markup.matchAll(/<svg[^>]*>(.*?)<\/svg>/g), (match) =>
    String(match[1]),
  );
}

describe("Logo", () => {
  it.each([
    ["full, default", {}],
    ["full, sized and colored", { height: 48, color: "#ff0000" }],
    ["full, with class", { className: "brand" }],
    ["icon, default", { variant: "icon" }],
    [
      "icon, sized, colored, with class",
      {
        variant: "icon",
        height: 20,
        color: "#00ff00",
        className: "mark",
      },
    ],
    ["text, default", { variant: "text" }],
    [
      "text, sized, colored, with class",
      {
        variant: "text",
        height: 18,
        color: "#0000ff",
        className: "word",
      },
    ],
    ["title", { title: "Rizom", className: "brand" }],
  ] as const)("renders %s unchanged", (_name, props) => {
    expect(renderToStaticMarkup(<Logo {...props} />)).toMatchSnapshot();
  });

  it("draws the same icon and wordmark in the full logo as in its variants", () => {
    const [fullIcon, fullText] = svgBodies(
      renderToStaticMarkup(<Logo color="#123456" />),
    );
    const [icon] = svgBodies(
      renderToStaticMarkup(<Logo variant="icon" color="#123456" />),
    );
    const [text] = svgBodies(
      renderToStaticMarkup(<Logo variant="text" color="#123456" />),
    );

    expect(fullIcon).toBe(icon);
    expect(fullText).toBe(text);
  });
});
