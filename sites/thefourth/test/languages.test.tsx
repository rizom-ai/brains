/** @jsxImportSource react */
import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup as render } from "react-dom/server";
import type { SiteAlternate, SiteLayoutInfo } from "@rizom/site";
import site from "../src";

const siteInfo: SiteLayoutInfo = {
  title: "The Fourth",
  description: "Brand consultancy, Taipei",
  copyright: "©2026 The Fourth",
  navigation: { primary: [], secondary: [] },
  socialLinks: [{ platform: "email", url: "mailto:nihao.fourth@gmail.com" }],
};

const BOTH: SiteAlternate[] = [
  { language: "en", path: "/" },
  { language: "zh-TW", path: "/zh-tw" },
];

function renderLayout(
  language: string,
  alternates: SiteAlternate[],
  path = "/",
): string {
  const Layout = site.layouts["default"];
  if (!Layout) throw new Error("the site has no default layout");
  return render(
    <Layout
      sections={[<p key="s">Act</p>]}
      title="The Fourth"
      description=""
      path={path}
      siteInfo={siteInfo}
      language={language}
      alternates={alternates}
    />,
  );
}

function renderSection(id: string, content?: Record<string, unknown>): string {
  const group = [site.sections ?? []]
    .flat()
    .find((candidate) => candidate.namespace === "home");
  const section = group?.sections[id];
  if (!section) throw new Error(`the home group has no ${id} section`);
  const Section = section.component;
  return render(
    <Section
      {...section.schema.parse(content ?? site.content?.["home"]?.[id] ?? {})}
    />,
  );
}

const fallback = (id: string): Record<string, unknown> =>
  JSON.parse(JSON.stringify(site.content?.["home"]?.[id] ?? {}));

describe("The Fourth in two languages", () => {
  test("is built in English and Traditional Chinese", () => {
    expect(site.languages).toEqual(["en", "zh-TW"]);
  });

  test("switches between the languages a page exists in, marking the one being read", () => {
    const english = renderLayout("en", BOTH);
    expect(english).toContain(
      '<a href="/" lang="en" aria-current="page">EN</a>',
    );
    // HTML attribute names are case-insensitive; React writes hrefLang.
    expect(english).toMatch(
      /<a href="\/zh-tw" lang="zh-TW" hreflang="zh-TW">中文<\/a>/i,
    );
    const chinese = renderLayout("zh-TW", BOTH, "/zh-tw");
    expect(chinese).toContain(
      '<a href="/zh-tw" lang="zh-TW" aria-current="page">中文</a>',
    );
  });

  test("offers no switch on a page that exists in one language", () => {
    expect(renderLayout("en", [{ language: "en", path: "/" }])).not.toContain(
      "中文",
    );
  });

  test("signs the footer in the page's language", () => {
    const english = renderLayout("en", BOTH);
    expect(english).toContain("(Brand consultancy)");
    expect(english).toContain("Made in Taipei");
    const chinese = renderLayout("zh-TW", BOTH, "/zh-tw");
    expect(chinese).toContain("（品牌顧問）");
    expect(chinese).toContain("台北出品");
    expect(chinese).not.toContain("Made in Taipei");
  });

  test("sets Chinese in Noto, loaded only on Chinese pages", () => {
    const css = site.themeOverride ?? "";
    expect(css).toMatch(
      /:root:lang\(zh-TW\) \{[^}]*--font-sans:[^;]*"Noto Sans TC"/,
    );
    expect(css).toMatch(
      /:root:lang\(zh-TW\) \{[^}]*--font-story:[^;]*"Noto Serif TC"/,
    );
    const scripts = (site.headScripts ?? []).join("\n");
    expect(scripts).toContain("family=Noto+Sans+TC");
    expect(scripts).toContain(
      'document.documentElement.lang.toLowerCase().indexOf("zh") === 0',
    );
  });

  test("writes the signposts from the crossroads copy", () => {
    const html = renderSection("crossroads", {
      ...fallback("crossroads"),
      signs: {
        thisWay: "這邊",
        stop: "停止",
        selling: "推銷",
        startTelling: "開始說故事",
        thatWay: "那邊",
        warning: "術語",
        ahead: "注意",
        yourWay: "你的路 →",
      },
    });
    for (const sign of [
      "這邊",
      "停止",
      "推銷",
      "開始說故事",
      "那邊",
      "術語",
      "注意",
      "你的路 →",
    ]) {
      expect(html).toContain(`>${sign}</text>`);
    }
    expect(html).not.toContain("THIS WAY");
  });

  test("scatters a spell by the words it lists, for a language without spaces", () => {
    const actTwo = fallback("act-two");
    const html = renderSection("act-two", {
      ...actTwo,
      spells: [
        {
          before: "我們運用交互記憶系統診斷知識分布。",
          words: ["我們", "運用", "交互記憶系統", "診斷", "知識分布。"],
          jargon: ["交互記憶系統", "知識分布。"],
          main: "如果你最有經驗的人明天離開，團隊會忘記什麼？",
          sub: "我們在那之前找出答案。",
          sector: "科技與 AI",
          light: "red",
        },
      ],
    });

    expect(html).toContain('aria-label="我們運用交互記憶系統診斷知識分布。"');
    expect(html).toContain('data-jargon="false">我們</span>');
    expect(html).toContain('data-jargon="true">交互記憶系統</span>');
    expect(html).toContain('data-jargon="true">知識分布。</span>');
  });

  test("teaches the spell script to scatter listed words", () => {
    expect((site.headScripts ?? []).join("\n")).toContain("spell.words");
  });
});
