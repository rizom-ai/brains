import { describe, expect, test } from "bun:test";
import {
  DEFAULT_FAVICON_SVG,
  essentialHeadTags,
  iconHeadPaths,
  withDefaultIcon,
} from "../src/essential-head";
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

describe("the default icon", () => {
  // Every brain is a light: a build that brings no icon of its own gets the
  // lantern, so no tab is blank and no page links an icon it does not have.
  test("is the lantern, one light on night", () => {
    expect(DEFAULT_FAVICON_SVG).toMatch(
      /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" viewBox="0 0 64 64">/,
    );
    expect(DEFAULT_FAVICON_SVG).toContain('fill="#14132b"');
    expect(DEFAULT_FAVICON_SVG).toContain('stroke="#d4af37"');
  });

  test("joins a build's static assets when neither an SVG nor a PNG icon is there", () => {
    const assets = withDefaultIcon({ "/boot.js": "x" }, []);
    expect(assets["/favicon.svg"]).toBe(DEFAULT_FAVICON_SVG);
    expect(assets["/boot.js"]).toBe("x");
    expect(iconHeadPaths(Object.keys(assets)).faviconSvgHref).toBe(
      "/favicon.svg",
    );
  });

  test("steps aside for a site's own icon, static or public, SVG or PNG", () => {
    const own = withDefaultIcon({ "/favicon.svg": "<svg/>" }, []);
    expect(own["/favicon.svg"]).toBe("<svg/>");
    expect(withDefaultIcon({}, ["favicon.png"])).toEqual({});
    expect(withDefaultIcon({}, ["/favicon.svg"])).toEqual({});
    expect(withDefaultIcon({ "favicon.svg": "<svg/>" }, [])).toEqual({
      "favicon.svg": "<svg/>",
    });
  });
});
