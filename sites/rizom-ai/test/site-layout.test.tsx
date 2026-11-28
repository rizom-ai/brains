/** @jsxImportSource react */
import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup as render } from "react-dom/server";
import { createSiteLayout, threeSiteFooter } from "../src/site-layout";
import { workOrganism } from "../src/story/work-organism";
import type { RizomLayoutProps } from "../src/rizom";

const siteInfo: RizomLayoutProps["siteInfo"] = {
  title: "Rizom Foundation",
  description: "A think tank that builds.",
  url: "https://rizom.foundation",
  copyright: "© 2026 Rizom",
  navigation: { primary: [], secondary: [] },
};

const FoundationLayout = createSiteLayout({
  site: "foundation",
  room: "foundation",
  barLinks: [
    { label: "Common Sense", href: "/common-sense" },
    { label: "Events", href: "/#events" },
  ],
  cta: {
    label: "Become a founding supporter",
    short: "Pledge",
    href: "/support",
  },
  footerColumns: threeSiteFooter("foundation"),
  footerNote:
    "The Rizom Foundation owns the code, the method and the Rizom name.",
  figures: {
    "/": { className: "work-org", organism: workOrganism },
  },
});

function page(path: string): string {
  return render(
    <FoundationLayout
      sections={[]}
      title="Rizom Foundation"
      description={siteInfo.description}
      path={path}
      siteInfo={siteInfo}
    />,
  );
}

const between = (html: string, from: string, to: string): string =>
  html.slice(html.indexOf(from), html.indexOf(to, html.indexOf(from)));

describe("one of the three sites", () => {
  test("names the three sites above the bar and marks its own", () => {
    const strip = between(page("/"), '<nav aria-label="Rizom sites"', "</nav>");
    for (const href of [
      "https://rizom.ai",
      "https://rizom.work",
      "https://rizom.foundation",
    ]) {
      expect(strip).toContain(`href="${href}"`);
    }
    expect(strip).toMatch(
      /href="https:\/\/rizom\.foundation"[^>]*aria-current="true"/,
    );
    expect(strip.match(/aria-current/g)).toHaveLength(1);
  });

  test("the wordmark carries the site's domain", () => {
    const bar = between(page("/"), "<header", "</header>");
    expect(bar).toMatch(/<a href="\/"[^>]*aria-label="rizom\.foundation"/);
    expect(bar).toContain(">foundation</span>");
  });

  test("keeps its own light on every page", () => {
    const wrapper = '<div data-room="foundation" class="relative">';
    expect(page("/")).toContain(wrapper);
    expect(page("/common-sense")).toContain(wrapper);
  });

  test("the call to action is one word where the full one does not fit", () => {
    const bar = between(page("/"), "<header", "</header>");
    expect(bar).toMatch(
      /href="\/support"[^>]*><span class="hidden sm:inline">Become a founding supporter<\/span><span class="sm:hidden">Pledge<\/span>/,
    );
  });

  test("the footer has one column per site, its own links on this site and the others' on theirs", () => {
    const footer = page("/").slice(page("/").indexOf("<footer"));
    for (const heading of ["rizom.ai", "rizom.work", "rizom.foundation"]) {
      expect(footer).toContain(`>${heading}</div>`);
    }
    expect(footer).toMatch(/<a href="\/common-sense"[^>]*>Common Sense<\/a>/);
    expect(footer).toMatch(
      /<a href="https:\/\/rizom\.ai\/ask"[^>]*>Ask the network<\/a>/,
    );
    expect(footer).toContain(
      "The Rizom Foundation owns the code, the method and the Rizom name.",
    );
  });

  test("tells its story pages beside its drawing and leaves the others plain", () => {
    expect(page("/")).toContain('class="figure work-org" data-stage="0"');
    expect(page("/common-sense")).not.toContain('class="story"');
  });
});

describe("the columns for each of the three sites", () => {
  test("rizom.ai's own links stay on rizom.ai", () => {
    const [ai, work, foundation] = threeSiteFooter("ai");
    expect(
      ai?.links.every((link) => !link.href.startsWith("https://rizom.ai")),
    ).toBe(true);
    expect(
      work?.links.every((link) => link.href.startsWith("https://rizom.work")),
    ).toBe(true);
    expect(
      foundation?.links.every((link) =>
        link.href.startsWith("https://rizom.foundation"),
      ),
    ).toBe(true);
  });
});
