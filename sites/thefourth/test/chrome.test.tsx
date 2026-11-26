/** @jsxImportSource react */
import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup as render } from "react-dom/server";
import type { SiteAlternate, SiteLayoutInfo } from "@rizom/site";
import site from "../src";

const siteInfo: SiteLayoutInfo = {
  title: "The Fourth",
  description: "Brand consultancy, Taipei",
  copyright: "©2026 The Fourth",
  navigation: {
    primary: [{ label: "Agents", href: "/agents", priority: 10 }],
    secondary: [],
  },
  cta: {
    heading: "Start your fourth act",
    buttonText: "Let’s talk",
    buttonLink: "/work-with-us",
  },
  socialLinks: [{ platform: "email", url: "mailto:nihao.fourth@gmail.com" }],
};

const BOTH: SiteAlternate[] = [
  { language: "en", path: "/what" },
  { language: "zh-TW", path: "/zh-tw/what" },
];

function renderLayout(
  path: string,
  language = "en",
  alternates: SiteAlternate[] = [],
  info: SiteLayoutInfo = siteInfo,
): string {
  const Layout = site.layouts["default"];
  if (!Layout) throw new Error("the site has no default layout");
  return render(
    <Layout
      sections={[<p key="s">Act</p>]}
      title="The Fourth"
      description=""
      path={path}
      siteInfo={info}
      language={language}
      alternates={alternates}
    />,
  );
}

const between = (html: string, start: string, end: string): string => {
  const from = html.indexOf(start);
  return from < 0 ? "" : html.slice(from, html.indexOf(end, from));
};

describe("the paper frame around every page", () => {
  test("names the four pages in the header, marking the one being read", () => {
    const nav = between(renderLayout("/who"), '<nav class="tf-nav"', "</nav>");
    expect(nav).toContain('aria-label="Main"');
    expect(nav.match(/<a /g)?.length).toBe(4);
    expect(nav).toContain('<a class="tf-nl" href="/what">What</a>');
    expect(nav).toContain(
      '<a class="tf-nl" href="/who" aria-current="page">Who</a>',
    );
    expect(nav).toContain('<a class="tf-nl" href="/how">How</a>');
    expect(nav).toContain('<a class="tf-nl" href="/about">About</a>');
  });

  test("leaves the routes other plugins add out of the site's own navigation", () => {
    expect(renderLayout("/")).not.toContain("/agents");
  });

  test("folds the pages into a menu for small screens, home and the call to talk included", () => {
    const menu = between(
      renderLayout("/what"),
      '<details class="tf-menu"',
      "</details>",
    );
    expect(menu).toMatch(
      /<summary class="tf-menu__button"[^>]*>.*Menu<\/summary>/,
    );
    expect(menu).toContain('<a class="tf-mlink" href="/">Home</a>');
    expect(menu).toContain(
      '<a class="tf-mlink" href="/what" aria-current="page">What</a>',
    );
    expect(menu).toContain(
      '<a class="tf-mlink tf-mlink--talk" href="/work-with-us">Let’s talk</a>',
    );
  });

  test("lists the pages again in the footer, with the call to talk last", () => {
    expect(
      between(renderLayout("/"), '<nav class="tf-foot__nav"', "</nav>"),
    ).toBe(
      '<nav class="tf-foot__nav" aria-label="Footer"><a class="tf-flink" href="/what">What</a><a class="tf-flink" href="/who">Who</a><a class="tf-flink" href="/how">How</a><a class="tf-flink" href="/about">About</a><a class="tf-flink" href="/work-with-us">Let’s talk</a>',
    );
  });

  test("offers a way back to the top of the page", () => {
    const html = renderLayout("/how");
    expect(html).toContain('id="top"');
    expect(html).toContain(
      '<a class="tf-top" href="#top" aria-label="Back to top">↑</a>',
    );
  });

  test("keeps Chinese readers on Chinese pages, in the words of Sam's design", () => {
    const html = renderLayout("/zh-tw/what", "zh-TW", BOTH, {
      ...siteInfo,
      cta: {
        heading: "",
        buttonText: "聊聊吧",
        buttonLink: "/zh-tw/work-with-us",
      },
    });
    const nav = between(html, '<nav class="tf-nav"', "</nav>");
    expect(nav).toContain(
      '<a class="tf-nl" href="/zh-tw/what" aria-current="page">What</a>',
    );
    expect(nav).toContain('<a class="tf-nl" href="/zh-tw/about">About</a>');
    expect(html).toContain('<a class="tf-mlink" href="/zh-tw">首頁</a>');
    expect(html).toMatch(
      /<summary class="tf-menu__button"[^>]*>.*選單<\/summary>/,
    );
    expect(html).toContain(
      '<a class="tf-mlink tf-mlink--talk" href="/zh-tw/work-with-us">聊聊吧</a>',
    );
  });

  test("puts the language switch in the menu too, where the header has no room for it", () => {
    const menu = between(
      renderLayout("/what", "en", BOTH),
      '<details class="tf-menu"',
      "</details>",
    );
    expect(menu).toContain('class="tf-lang tf-lang--menu"');
    expect(menu).toContain('href="/zh-tw/what"');
  });
});
