/** @jsxImportSource react */
import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup as render } from "react-dom/server";
import site from "../src";

type Content = Record<string, unknown>;

/** A route's section drawn in Chinese, from the given copy over its own. */
function drawChinese(
  routeId: string,
  sectionId: string,
  copy: Content = {},
): string {
  const route = site.routes.find((candidate) => candidate.id === routeId);
  const placed = route?.sections?.find((section) => section.id === sectionId);
  if (!placed) throw new Error(`no section ${sectionId} on ${routeId}`);
  const [namespace, name] = placed.template.split(":");
  const section = [site.sections ?? []]
    .flat()
    .find((group) => group.namespace === namespace)?.sections[name ?? ""];
  if (!section) throw new Error(`no section ${placed.template}`);
  const Section = section.components?.["zh-TW"] ?? section.component;
  return render(
    <Section
      {...section.schema.parse(Object.assign({}, placed.content, copy))}
    />,
  );
}

/** The same section drawn in English, from the design's copy. */
function drawEnglish(routeId: string, sectionId: string): string {
  const route = site.routes.find((candidate) => candidate.id === routeId);
  const placed = route?.sections?.find((section) => section.id === sectionId);
  if (!placed) throw new Error(`no section ${sectionId} on ${routeId}`);
  const [namespace, name] = placed.template.split(":");
  const section = [site.sections ?? []]
    .flat()
    .find((group) => group.namespace === namespace)?.sections[name ?? ""];
  if (!section) throw new Error(`no section ${placed.template}`);
  const Section = section.component;
  return render(<Section {...section.schema.parse(placed.content)} />);
}

describe("The Fourth's inner pages in Chinese", () => {
  test("gives every inner page a Chinese title", () => {
    for (const id of ["what", "who", "how", "about", "work-with-us"]) {
      const route = site.routes.find((candidate) => candidate.id === id);
      expect(route?.translations?.["zh-TW"]?.title).toMatch(/— The Fourth$/);
    }
  });

  test("opens What, Who and How on a lit stage, each with its bar of the page", () => {
    const who = drawChinese("who", "intro", {
      headline: "每個領域都有自己的語言，",
      headlineTail: "我們學會*你的*。",
      lede: "",
      pageNavLabel: "本頁",
      pageNavName: "本頁導覽",
      pageNavAction: { label: "預約品牌診斷 →", href: "/zh-tw/work-with-us" },
    });
    expect(who).toContain(
      '<section class="tf-intro tf-intro--stage tf-intro--mustard tf-intro--mark-pill">',
    );
    expect(who).toContain('<span class="tf-intro__mark">你的</span>');
    expect(who).toContain('<div class="tf-bobby">');
    expect(who).toMatch(
      /<\/section><nav class="tf-subnav" aria-label="本頁導覽">.*<a class="tf-subnav__link" href="#sustainability">/,
    );
    expect(who).not.toContain('class="tf-intro__lede"');
    expect(drawChinese("what", "intro")).toContain("tf-intro--red");
    expect(drawChinese("how", "intro")).toContain("tf-intro--mint");
    expect(drawEnglish("who", "intro")).not.toContain("tf-intro--stage");
  });

  test("keeps each of Who's worlds a section of its own, at its anchor", () => {
    const route = site.routes.find((candidate) => candidate.id === "who");
    expect(route?.sections?.map((section) => section.id)).toEqual([
      "intro",
      "sustainability",
      "health",
      "tech",
      "art",
      "next-step",
    ]);
    expect(drawEnglish("who", "health")).toContain(
      '<section id="health" class="tf-band tf-world">',
    );
  });

  test("lists What's services beside their steps, numbered across them", () => {
    const html = drawEnglish("what", "services");
    expect(html).toContain('<div class="tf-index__row tf-index__row--mint">');
    expect(html).toContain(
      '<a class="tf-index__tile" href="#matching"><span class="tf-index__n">06</span>',
    );
    expect(html).toContain(
      '<article id="matching" class="tf-service tf-service--mint">',
    );
  });

  test("gives What's Chinese index the cycle and a bar of the steps", () => {
    const html = drawChinese("what", "services", {
      cycle: {
        label: "看見、訴說、抵達、成果",
        repeat: "repeat",
        stations: [
          { label: "看見", light: "mustard" },
          { label: "成果", light: "ink" },
        ],
      },
      subnav: { label: "本頁導覽", lead: "本頁" },
    });
    expect(html).toContain(
      '<div class="tf-cycle" role="group" aria-label="看見、訴說、抵達、成果">',
    );
    expect(html).toContain('<span class="tf-subnav__label">本頁</span>');
  });

  test("tells How without its case in Chinese", () => {
    expect(drawChinese("how", "case")).toBe("");
    expect(drawChinese("how", "story")).toBe("");
    expect(drawEnglish("how", "case")).not.toBe("");
  });

  test("draws How's pattern as a track of four steps under brackets", () => {
    const html = drawChinese("how", "pattern", {
      steps: [
        {
          name: "看見",
          tag: "See",
          title: "它早就存在",
          text: "在你的團隊身上。",
        },
        {
          name: "訴說",
          tag: "Tell",
          title: "把它收齊、說對",
          text: "品牌診斷。",
        },
      ],
      reachLink: {
        label: "抵達 → ContentDNA 創作者媒合",
        href: "#contentdna",
        light: "red",
      },
      promise: {
        name: "承諾",
        tag: "Promise",
        title: "一輪比一輪準",
        text: "每一輪成效，都告訴我們下一輪該找誰。",
        link: {
          label: "承諾 → 帶給客戶的成效",
          href: "#benefits",
          light: "ink",
        },
      },
      repeat: { label: "repeat", text: "每一輪都觸及上一輪錯過的人。" },
    });
    expect(html.match(/class="tf-track__step"/g)?.length).toBe(4);
    expect(html).toContain(
      '<span class="tf-track__n tf-track__n--red">3</span>',
    );
    expect(html).toContain("tf-bracket--from-4 tf-bracket--span-1");
    expect(html).toContain(
      "<strong>repeat</strong>：每一輪都觸及上一輪錯過的人。",
    );
  });

  test("closes How on three circles round the promise", () => {
    const html = drawChinese("how", "benefits", {
      headline: "帶給客戶的成效",
      center: "把好的產品、\n正確資訊",
    });
    expect(html).toContain(
      '<div class="tf-venn" role="list" aria-label="帶給客戶的成效">',
    );
    expect(html).toContain(
      '<span class="tf-vn">04</span><strong>把好的產品、<br/>正確資訊</strong>',
    );
  });
});
