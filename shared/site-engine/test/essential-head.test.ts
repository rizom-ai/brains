import { describe, expect, test } from "bun:test";
import { essentialHeadTags, iconHeadPaths } from "../src/essential-head";
import { HeadCollector } from "../src/head-collector";
import { createHTMLShell } from "../src/html-generator";

describe("the essential head", () => {
  test("lists the PNG icon before the SVG, so browsers that take the last icon use the SVG and fetch no missing PNG", () => {
    const tags = essentialHeadTags();
    const png = tags.findIndex((tag) => tag.includes('type="image/png"'));
    const svg = tags.findIndex((tag) => tag.includes('type="image/svg+xml"'));
    expect(png).toBeGreaterThanOrEqual(0);
    expect(svg).toBeGreaterThan(png);
  });
});

describe("the icons a page links", () => {
  test("are the ones the build has, and no others", () => {
    expect(iconHeadPaths(["/favicon.svg", "styles/main.css"])).toEqual({
      faviconSvgHref: "/favicon.svg",
      faviconPngHref: null,
    });
    expect(iconHeadPaths(["favicon.png"])).toEqual({
      faviconSvgHref: null,
      faviconPngHref: "/favicon.png",
    });
  });

  test("leave no icon link where the build has no icon", () => {
    const tags = essentialHeadTags(iconHeadPaths([]));
    expect(tags.some((tag) => tag.includes('rel="icon"'))).toBe(false);
  });

  test("reach the head collector and the page shell", () => {
    const paths = iconHeadPaths(["/favicon.svg"]);
    const head = new HeadCollector("Site", paths).generateHeadHTML();
    expect(head).toContain('href="/favicon.svg"');
    expect(head).not.toContain("favicon.png");
    const shell = createHTMLShell(
      "<p>x</p>",
      undefined,
      "Site",
      "dark",
      undefined,
      [],
      paths,
    );
    expect(shell).toContain('href="/favicon.svg"');
    expect(shell).not.toContain("favicon.png");
  });
});
