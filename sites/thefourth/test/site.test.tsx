/** @jsxImportSource react */
import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup as render } from "react-dom/server";
import type { SiteLayoutInfo } from "@rizom/site";
import site from "../src";

const siteInfo: SiteLayoutInfo = {
  title: "The Fourth",
  description: "Brand consultancy, Taipei",
  copyright: "The Fourth · Taipei",
  navigation: {
    primary: [{ label: "Agents", href: "/agents", priority: 10 }],
    secondary: [],
  },
  cta: {
    heading: "Start your fourth act",
    buttonText: "Let’s talk",
    buttonLink: "mailto:nihao.fourth@gmail.com",
  },
  socialLinks: [{ platform: "email", url: "mailto:nihao.fourth@gmail.com" }],
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
      eyebrow: "A story in four acts",
      title: "The Fourth",
      subtitle: "or, How Hard-to-Explain Things Finally Got Understood",
      cue: "Step through",
    });
    const html = renderCover(fallback ?? {});
    expect(html).toContain("A story in four acts");
    expect(html).toContain("The<br/>Fourth");
    expect(html).toContain(
      "or, How Hard-to-Explain Things Finally Got Understood",
    );
    expect(html).toContain("Step through");
  });

  test("draws the stage: the keyhole, the curtains and the props", () => {
    const html = renderCover(site.content?.["home"]?.["cover"] ?? {});
    expect(html).toContain('class="tf-keyhole');
    expect(html).toContain("tf-curtain tf-curtain--left");
    expect(html).toContain("tf-curtain tf-curtain--right");
    expect(html).toContain("tf-prop tf-prop--watch");
    expect(html).toContain("tf-prop tf-prop--key");
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
    expect(html).toContain('href="mailto:nihao.fourth@gmail.com"');
    expect(html).toContain("Let’s talk");
    const { cta: _cta, ...withoutCta } = siteInfo;
    expect(renderLayout(withoutCta)).not.toContain("Let’s talk");
  });

  test("signs off with the copyright and the email the brain gives", () => {
    const html = renderLayout(siteInfo);
    expect(html).toContain("The Fourth · Taipei");
    expect(html).toContain(">nihao.fourth@gmail.com</a>");
    const { socialLinks: _links, ...withoutLinks } = siteInfo;
    expect(renderLayout(withoutLinks)).not.toContain(
      ">nihao.fourth@gmail.com</a>",
    );
  });
});
