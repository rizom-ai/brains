/** @jsxImportSource preact */
import { describe, expect, test } from "bun:test";
import { render } from "preact-render-to-string";
import { AiLayout } from "../src/layout";
import type { RizomLayoutProps } from "@rizom/site-rizom";

const siteInfo: RizomLayoutProps["siteInfo"] = {
  title: "Rizom",
  description: "Own the intelligence you already have.",
  url: "https://rizom.ai",
  copyright: "© 2026 Rizom",
  navigation: { primary: [], secondary: [] },
};

function renderChrome(path: string): string {
  return render(
    <AiLayout
      sections={[]}
      title="Rizom"
      description={siteInfo.description}
      path={path}
      siteInfo={siteInfo}
    />,
  );
}

describe("AiLayout chrome", () => {
  test("renders the boot-wired theme toggle so light mode is reachable", () => {
    const html = renderChrome("/");
    // boot.js binds by id and window.toggleTheme flips data-theme; without
    // this button the theme's entire light palette is dead UI.
    expect(html).toContain('id="themeToggle"');
    expect(html).toContain('aria-label="Toggle color theme"');
  });

  test("faces strip survives narrow viewports: it may wrap, never overflow", () => {
    const html = renderChrome("/brain");
    expect(html).toContain("flex-wrap items-baseline");
  });

  test("face nav links appear from sm up (footer covers them below)", () => {
    const html = renderChrome("/brain");
    // Was md:flex — on phones the per-face links had no home at all.
    expect(html).toMatch(/hidden[^"]*sm:flex/);
    expect(html).not.toMatch(/hidden[^"]*md:flex/);
  });

  test("every face keeps its chrome links and CTA", () => {
    const html = renderChrome("/work");
    expect(html).toContain("https://form.typeform.com/to/NGqo9Fnf");
    expect(html).toContain("/work#workshop");
    expect(html).toContain("/work#contact");
  });

  test("home nav carries the org indexes; the faces strip does not", () => {
    const html = renderChrome("/");
    const strip = html.slice(html.indexOf("<header"), html.indexOf("<nav"));
    const nav = html.slice(html.indexOf("<nav"), html.indexOf("</nav>"));
    // Writing/Network moved from the strip into the home page's own nav
    // (the strip keeps only the three faces and the theme toggle).
    expect(nav).toContain('href="/writing"');
    expect(nav).toContain('href="/network"');
    expect(nav).not.toContain("docs.rizom.ai");
    expect(strip).not.toContain('href="/writing"');
    expect(strip).not.toContain('href="/network"');
  });

  test("org-index pages still claim no face in the strip", () => {
    const html = renderChrome("/writing");
    const strip = html.slice(html.indexOf("<header"), html.indexOf("<nav"));
    expect(strip).not.toContain('aria-current="page"');
  });

  test("the strip's rizom mark links back to the homepage", () => {
    const html = renderChrome("/brain");
    const strip = html.slice(html.indexOf("<header"), html.indexOf("<nav"));
    expect(strip).toMatch(/<a href="\/"[^>]*>rizom<\/a>/);
  });

  test("org-index pages wear the plain umbrella wordmark, not rizom.brain", () => {
    for (const path of ["/writing", "/network"]) {
      const html = renderChrome(path);
      expect(html).not.toContain(">brain</span>");
    }
    // The face pages keep their nameplates.
    expect(renderChrome("/brain")).toContain(">brain</span>");
  });
});
