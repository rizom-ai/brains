import { describe, expect, test } from "bun:test";
import { createElement as h } from "react";
import { renderToStaticMarkup as render } from "react-dom/server";
import type { SiteLayoutInfo } from "@rizom/site";
import site from "../src";
import { DocsSiteLayout } from "../src/layout";

const siteInfo: SiteLayoutInfo = {
  title: "Brains docs",
  description: "How to use, run and extend a brain",
  copyright: "© Rizom",
  cta: {
    heading: "Run your own",
    buttonText: "Get Brains",
    buttonLink: "https://rizom.ai",
  },
  navigation: {
    primary: [
      { label: "Docs", href: "/", priority: 10 },
      { label: "Guides", href: "/guides", priority: 20 },
      // Generated for every entity type the brain lists; not the docs'.
      { label: "Topics", href: "/topics", priority: 40 },
      { label: "Posts", href: "/posts", priority: 40 },
    ],
    secondary: [{ label: "Roadmap", href: "/docs/roadmap", priority: 10 }],
  },
  socialLinks: [
    { platform: "github", url: "https://github.com/rizom-ai/brains" },
  ],
};

function page(path: string, info: SiteLayoutInfo = siteInfo): string {
  return render(
    h(DocsSiteLayout, {
      sections: [h("p", { key: "body" }, "Page body")],
      title: "Documentation",
      description: "Brains documentation",
      path,
      siteInfo: info,
    }),
  );
}

describe("DocsSiteLayout", () => {
  const html = page("/guides/writer");

  test("names the site in its header, linked home", () => {
    expect(html).toMatch(/<header[^>]*>.*href="\/".*Brains docs/s);
  });

  test("leads to every page the site puts in its navigation", () => {
    expect(html).toContain('href="/guides"');
    expect(html).toContain(">Guides</a>");
    expect(html).toContain(">Docs</a>");
  });

  test("leaves out the indexes the brain generates for its other types", () => {
    const header = html.slice(0, html.indexOf("</header>"));
    expect(header).not.toContain('href="/topics"');
    expect(header).not.toContain('href="/posts"');
  });

  test("marks the section of the page being read", () => {
    expect(html).toMatch(/href="\/guides"[^>]*aria-current="page"/);
    expect(html).not.toMatch(/href="\/"[^>]*aria-current="page"/);
  });

  test("links the site's code and offers its call to action", () => {
    expect(html).toContain('href="https://github.com/rizom-ai/brains"');
    expect(html).toMatch(/href="https:\/\/rizom.ai"[^>]*>Get Brains</);
  });

  test("lets the reader switch between light and dark", () => {
    expect(html).toContain("data-theme-toggle");
  });

  test("closes with the secondary navigation and the copyright", () => {
    const footer = html.slice(html.indexOf("<footer"));
    expect(footer).toContain('href="/docs/roadmap"');
    expect(footer).toContain("© Rizom");
  });

  test("leaves out the framework's placeholder copyright", () => {
    const html = page("/", { ...siteInfo, copyright: "Powered by Rizom" });
    expect(html).not.toContain("Powered by Rizom");
  });

  test("draws the page's sections between header and footer", () => {
    expect(html.indexOf("Page body")).toBeGreaterThan(
      html.indexOf("</header>"),
    );
    expect(html.indexOf("Page body")).toBeLessThan(html.indexOf("<footer"));
  });
});

describe("the docs site's navigation", () => {
  test("puts the guides beside the docs", () => {
    // The generated /guides route pluralizes `label` into "Guides".
    expect(site.entityDisplay["guide"]?.label).toBe("Guide");
    expect(site.entityDisplay["guide"]?.navigation).toEqual({
      show: true,
      slot: "primary",
      priority: 20,
    });
  });
});
