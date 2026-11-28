/** @jsxImportSource react */
import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup as render } from "react-dom/server";
import type {
  SectionDefinition,
  SiteAlternate,
  SiteLayoutInfo,
} from "@rizom/site";
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

function renderLayout(language: string, path = "/"): string {
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
      alternates={BOTH}
    />,
  );
}

function homeSection(id: string): SectionDefinition {
  const group = [site.sections ?? []]
    .flat()
    .find((candidate) => candidate.namespace === "home");
  const section = group?.sections[id];
  if (!section) throw new Error(`the home group has no ${id} section`);
  return section;
}

const fallback = (id: string): Record<string, unknown> =>
  JSON.parse(JSON.stringify(site.content?.["home"]?.[id] ?? {}));

/** A home section drawn in English or, by its Chinese drawing, in Chinese. */
function draw(
  id: string,
  language: "english" | "chinese",
  content: Record<string, unknown>,
): string {
  const section = homeSection(id);
  const Section =
    language === "chinese"
      ? (section.components?.["zh-TW"] ?? section.component)
      : section.component;
  return render(<Section {...section.schema.parse(content)} />);
}

describe("The Fourth's chrome in Chinese", () => {
  test("glosses each page name in Chinese under the English", () => {
    const chinese = renderLayout("zh-TW", "/zh-tw");
    for (const [name, gloss] of [
      ["What", "服務項目"],
      ["Who", "合作對象"],
      ["How", "工作方法"],
      ["About", "關於我們"],
    ]) {
      expect(chinese).toContain(
        `${name}<span class="tf-nl__gloss">${gloss}</span></a>`,
      );
      expect(chinese).toContain(
        `${name}<span class="tf-mlink__gloss">${gloss}</span></a>`,
      );
    }
    expect(renderLayout("en")).not.toContain("gloss");
  });

  test("names the language being read first in the switch", () => {
    const chinese = renderLayout("zh-TW", "/zh-tw");
    expect(chinese).toMatch(
      />中文<\/a><\/span><span><span class="tf-lang__sep"> \/ <\/span><a href="\/"/,
    );
    const english = renderLayout("en");
    expect(english).toMatch(
      />EN<\/a><\/span><span><span class="tf-lang__sep"> \/ <\/span><a href="\/zh-tw"/,
    );
  });

  test("labels its landmarks in Chinese", () => {
    const chinese = renderLayout("zh-TW", "/zh-tw");
    expect(chinese).toContain('aria-label="The Fourth 首頁"');
    expect(chinese).toContain('class="tf-nav" aria-label="主選單"');
    expect(chinese).toContain('class="tf-foot__nav" aria-label="頁尾"');
    expect(chinese).toContain('class="tf-lang" aria-label="語言"');
    const english = renderLayout("en");
    expect(english).toContain('aria-label="The Fourth home"');
    expect(english).toContain('class="tf-nav" aria-label="Main"');
  });
});

describe("The Fourth's homepage in Chinese", () => {
  test("joins a Chinese headline to its emphasis without a space", () => {
    const zh = {
      ...fallback("crossroads"),
      headline: "你是哪一種",
      emphasis: "品牌？",
    };
    expect(draw("crossroads", "chinese", zh)).toContain(
      "你是哪一種<em>品牌？</em>",
    );
    expect(draw("crossroads", "english", fallback("crossroads"))).toMatch(
      /[^\s>] <em>/,
    );
  });

  test("adds a second scroll cue to the cover", () => {
    expect(draw("cover", "english", fallback("cover"))).toContain(
      'class="tf-cover__cue2"',
    );
  });

  test("sets Act II as the old copy beside the locked good copy", () => {
    const html = draw("act-two", "chinese", {
      ...fallback("act-two"),
      aside: "每個字都對，卻沒有人聽得進去。",
      beforeLabel: "舊文案",
      afterLabel: "好文案",
      unlockPrompt: "同一段話，換個說法。\n好文案就鎖在這裡。",
      unlockHint: "按下按鈕，看看我們怎麼改寫",
    });
    expect(html).toContain('<div class="tf-spell__old">');
    expect(html).toContain('<span class="tf-pill tf-pill--old">舊文案</span>');
    expect(html).toContain('<div class="tf-spell__new">');
    expect(html).toContain("同一段話，換個說法。\n好文案就鎖在這裡。");
    expect(html).toContain(
      '<span class="tf-spell__hint">按下按鈕，看看我們怎麼改寫</span>',
    );
    expect(html).toContain("<strong>舊文案：</strong>");
    expect(html).toContain('data-tf-before=""');
    // Two counters, both kept current by the spell script.
    expect(html.match(/data-tf-counter=""/g)?.length).toBe(2);
    expect(draw("act-two", "english", fallback("act-two"))).not.toContain(
      "tf-spell__old",
    );
  });

  test("keeps every counter and the struck sentence current as spells change", () => {
    const script = (site.headScripts ?? []).join("\n");
    expect(script).toContain('querySelectorAll("[data-tf-counter]")');
    expect(script).toContain("[data-tf-before]");
  });

  test("puts Act III's claim beside a card of note and worlds, and glosses each way in", () => {
    const actThree = fallback("act-three");
    const glosses = ["看見", "訴說", "抵達"];
    const spells = [actThree["spells"]].flat().map((spell, index) => ({
      ...Object(spell),
      gloss: glosses[index],
    }));
    const html = draw("act-three", "chinese", {
      ...actThree,
      intro: "三個步驟：看清楚、說清楚，再找到對的人。",
      note: "從品牌診斷到創作者媒合，同一個團隊從頭跟到尾。",
      more: { label: "How we work →", href: "/zh-tw/how" },
      spells,
    });
    expect(html).toContain(
      '<h2 class="tf-act-three__headline">三個步驟：看清楚、說清楚，再找到對的人。</h2>',
    );
    expect(html).toContain(
      '<a class="tf-btn tf-btn--ink" href="/zh-tw/how">How we work →</a>',
    );
    expect(html).toMatch(
      /<div class="tf-act-three__card tf-reveal"><p class="tf-act-three__note">/,
    );
    expect(html).toContain(
      'See. <span class="tf-guide-spell__gloss">看見</span>',
    );
    expect(html).not.toContain('class="tf-sectors tf-reveal"');
  });

  test("gives Act IV's cards titles and stats, each quote under its client", () => {
    const html = draw("act-four", "chinese", {
      ...fallback("act-four"),
      feature: {
        eyebrow: "創作者媒合｜新北市美術館",
        headline: "讓不進美術館的人，走進美術館",
        figure: "158,000",
        unit: "+",
        text: "次曝光。",
      },
      figures: [
        {
          eyebrow: "議題溝通",
          headline: "沉重的議題",
          figure: "120.6K",
          unit: "",
          text: "觀看次數",
        },
        {
          eyebrow: "品牌定位",
          headline: "從代理商，走向自有品牌",
          figure: "12+",
          unit: "",
          text: "年度課程",
          stats: [{ value: "+1.7K", label: "Instagram 追蹤數" }],
        },
      ],
      story: {
        eyebrow: "溝通策略｜Rizom",
        headline: "把難懂的技術，說成投資人聽得懂的故事",
        figure: "€150K",
        text: "半年成功募資",
        stats: [{ value: "40+", label: "社群活躍使用者" }],
      },
    });
    expect(html).toContain(
      '<span class="tf-card__title">讓不進美術館的人，走進美術館</span>',
    );
    expect(html).toContain(
      '<span class="tf-card__stat"><strong>+1.7K</strong><span>Instagram 追蹤數</span></span>',
    );
    expect(html).toContain('<span class="tf-card__figure">120.6K</span>');
    expect(html).toMatch(
      /tf-cards__column--left">.*tf-card--ink.*Deputy Manager, TWTN.*<\/div><div class="tf-cards__column tf-cards__column--right">.*€150K.*Founder, Rizom/,
    );
  });
});
