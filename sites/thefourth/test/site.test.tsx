/** @jsxImportSource react */
import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup as render } from "react-dom/server";
import type { SiteLayoutInfo } from "@rizom/site";
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
    buttonLink: "mailto:nihao.fourth@gmail.com",
  },
  socialLinks: [
    { platform: "email", url: "mailto:nihao.fourth@gmail.com" },
    {
      platform: "instagram",
      url: "https://www.instagram.com/notaboutyou_bs/",
    },
    {
      platform: "linkedin",
      url: "https://www.linkedin.com/company/hello-the-fourth",
    },
    {
      platform: "podcast",
      url: "https://podcasts.apple.com/tw/podcast/id1674146827",
    },
  ],
};

function renderLayout(info: SiteLayoutInfo): string {
  const Layout = site.layouts["default"];
  if (!Layout) throw new Error("the site has no default layout");
  return render(
    <Layout
      sections={[<p key="s">Act</p>]}
      title="The Fourth"
      description=""
      path="/"
      siteInfo={info}
    />,
  );
}

function renderCover(content: Record<string, unknown>): string {
  const cover = site.sections
    ? [site.sections].flat().find((group) => group.namespace === "home")
        ?.sections["cover"]
    : undefined;
  if (!cover) throw new Error("the home group has no cover section");
  const Cover = cover.component;
  return render(<Cover {...cover.schema.parse(content)} />);
}

describe("@rizom/site-thefourth", () => {
  test("opens on the home route, starting with the cover", () => {
    expect(site.routes.map((route) => route.id)).toEqual(["home"]);
    expect(site.routes[0]?.path).toBe("/");
    expect(site.routes[0]?.sections?.[0]).toMatchObject({
      id: "cover",
      template: "home:cover",
    });
  });

  test("tells the cover from the design's words until the brain has its own", () => {
    const fallback = site.content?.["home"]?.["cover"];
    expect(fallback).toEqual({
      lines: ["Unlocking", "Market[key]ng", "Secrets"],
      lead: "for the",
      audience: "Innovators, Creatives & Pioneers",
    });
    const html = renderCover(fallback ?? {});
    expect(html).toContain(
      'aria-label="Unlocking Marketing Secrets for the Innovators, Creatives &amp; Pioneers"',
    );
    expect(html).toContain('<span class="tf-initial">U</span>nlocking');
    expect(html).toContain('<span class="tf-initial">S</span>ecrets');
    expect(html).toContain("Innovators, Creatives &amp; Pioneers");
  });

  test("sets the keyhole in the headline where the content marks it", () => {
    const html = renderCover(site.content?.["home"]?.["cover"] ?? {});
    expect(html).toMatch(
      /<span class="tf-initial">M<\/span>arket<\/span><span class="tf-keyhole-slot"[^>]*>[\s\S]*<span class="tf-fadeout">ng<\/span>/,
    );
    expect(html).toContain("tf-keyhole tf-zoom");
  });

  test("scatters seven keys around the keyhole, two of them only on wide screens", () => {
    const html = renderCover(site.content?.["home"]?.["cover"] ?? {});
    expect(html.match(/class="tf-key"/g)?.length).toBe(7);
    expect(html.match(/tf-key-slot tf-hide-sm/g)?.length).toBe(2);
    expect(html).toContain("--x:-24vw");
  });

  test("hangs the scalloped valance between the curtains", () => {
    const html = renderCover(site.content?.["home"]?.["cover"] ?? {});
    expect(html).toContain("tf-curtain tf-curtain--left");
    expect(html).toContain("tf-curtain tf-curtain--right");
    expect(html).toContain("tf-valance");
    expect(html.match(/Q /g)?.length).toBe(8);
  });

  test("frames every page with the logo and no menu", () => {
    const html = renderLayout(siteInfo);
    expect(html).toContain('aria-label="The Fourth home"');
    expect(html).toContain('href="/"');
    expect(html).not.toContain("<nav");
    expect(html).not.toContain("/agents");
  });

  test("offers the site's call to action as the one way to talk", () => {
    const html = renderLayout(siteInfo);
    expect(html).toContain(
      'class="tf-btn tf-btn--ink" href="mailto:nihao.fourth@gmail.com">Let’s talk</a>',
    );
    const { cta: _cta, ...withoutCta } = siteInfo;
    expect(renderLayout(withoutCta)).not.toContain("Let’s talk");
  });

  test("signs off on red: the name, the email the brain gives and the copyright", () => {
    const html = renderLayout(siteInfo);
    expect(html).toContain('<footer class="tf-foot">');
    expect(html).toContain("The<br/>Fourth");
    expect(html).toContain("(Brand consultancy)");
    expect(html).toContain(
      'href="mailto:nihao.fourth@gmail.com">↳ nihao.fourth@gmail.com</a>',
    );
    expect(html).toContain("©2026 The Fourth");
    expect(html).not.toContain("Made in Taipei");
    const { socialLinks: _links, ...withoutLinks } = siteInfo;
    expect(renderLayout(withoutLinks)).not.toContain("↳");
  });

  test("lists the brain's profiles in the footer, each opening in a new tab", () => {
    const html = renderLayout(siteInfo);
    expect(html).toMatch(
      /<div class="tf-foot__social"><a class="tf-flink" href="https:\/\/www\.instagram\.com\/notaboutyou_bs\/" target="_blank" rel="noopener">Instagram<\/a><a class="tf-flink" href="https:\/\/www\.linkedin\.com\/company\/hello-the-fourth" target="_blank" rel="noopener">LinkedIn<\/a><a class="tf-flink" href="https:\/\/podcasts\.apple\.com\/tw\/podcast\/id1674146827" target="_blank" rel="noopener">Podcast<\/a><\/div>/,
    );
    expect(html.match(/nihao\.fourth@gmail\.com<\/a>/g)?.length).toBe(1);
    const { socialLinks: _links, ...withoutLinks } = siteInfo;
    expect(renderLayout(withoutLinks)).not.toContain("tf-foot__social");
  });

  test("ends on the copyright, with a quiet credit to Rizom under it", () => {
    expect(renderLayout(siteInfo)).toContain(
      '<div class="tf-foot__end"><span>©2026 The Fourth</span><a class="tf-flink tf-foot__credit" href="https://rizom.ai" target="_blank" rel="noopener">Powered by Rizom</a></div>',
    );
  });

  test("keeps the legal pages' places in the footer until they exist", () => {
    expect(renderLayout(siteInfo)).toContain(
      '<div class="tf-foot__legal"><a class="tf-flink" href="#">Privacy policy</a><a class="tf-flink" href="#">Terms of service</a><a class="tf-flink" href="#">Cookie policy</a></div>',
    );
  });

  test("shows the anchor's photo at the foot, and leaves no frame without one", () => {
    const html = renderLayout({
      ...siteInfo,
      photo:
        "![Sam and Becca lying among books, laughing](entity://image/sam-x-becca)",
    });
    expect(html).toContain(
      '<div class="tf-foot__bottom"><figure class="tf-foot__photo"><div class="tf-foot__frame"><img src="/images/sam-x-becca.webp" alt="Sam and Becca lying among books, laughing" loading="lazy"/></div></figure>',
    );
    expect(renderLayout(siteInfo)).not.toContain("tf-foot__photo");
  });
});
