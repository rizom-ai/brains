/** @jsxImportSource react */
import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup as render } from "react-dom/server";
import type { SiteLayoutInfo } from "@rizom/site";
import site from "../src";

const siteInfo: SiteLayoutInfo = {
  title: "Rizom Hub Eindhoven",
  description: "Where an ecosystem keeps what it learns",
  copyright: "Rizom Hub Eindhoven",
  navigation: {
    primary: [{ label: "Notes", href: "/notes", priority: 10 }],
    secondary: [],
  },
  cta: {
    heading: "Bring a question",
    buttonText: "Talk to the hub",
    buttonLink: "mailto:hub@rizom.ai",
  },
};

function renderLayout(info: SiteLayoutInfo): string {
  const Layout = site.layouts["default"];
  if (!Layout) throw new Error("the site has no default layout");
  return render(
    <Layout
      sections={[<p key="s">Chapter</p>]}
      title="Rizom Hub Eindhoven"
      description=""
      path="/"
      siteInfo={info}
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
  const props = section.schema.parse(
    content ?? site.content?.["home"]?.[id] ?? {},
  );
  return render(<Section {...props} />);
}

describe("@rizom/site-hub", () => {
  test("opens on the home route, starting with the opening chapter", () => {
    expect(site.routes.map((route) => route.id)).toEqual(["home"]);
    expect(site.routes[0]?.path).toBe("/");
    expect(site.routes[0]?.sections?.[0]).toMatchObject({
      id: "opening",
      template: "home:opening",
    });
  });

  test("opens with the design's words until the brain has its own", () => {
    expect(site.content?.["home"]?.["opening"]).toEqual({
      eyebrow: "Rizom Hub",
      place: "Eindhoven",
      headline: "A place that keeps what its ecosystem *learns*.",
      lede: "Organizations, researchers and independent people already meet here to work on questions that matter to them. The hub makes sure what they learn stays: with them, with the hub, and with whoever comes next.",
      cue: "Scroll to see why",
      coordinates: "51.44° N · 5.47° E",
    });
    const html = renderSection("opening");
    expect(html).toContain("Rizom Hub");
    expect(html).toContain("Eindhoven");
    expect(html).toContain(
      "A place that keeps what its ecosystem <em>learns</em>.",
    );
    expect(html).toContain("Organizations, researchers and independent people");
    expect(html).toContain("Scroll to see why");
  });

  test("tells the opening in the brain's words when it has them", () => {
    const html = renderSection("opening", {
      eyebrow: "Rizom Hub",
      place: "Eindhoven",
      headline: "Where the ecosystem *remembers*.",
      lede: "A new lede.",
      cue: "Read on",
      coordinates: "51.44° N · 5.47° E",
    });
    expect(html).toContain("Where the ecosystem <em>remembers</em>.");
    expect(html).toContain("A new lede.");
    expect(html).not.toContain("Scroll to see why");
  });

  test("hands the opening to the field as its scene", () => {
    const html = renderSection("opening");
    expect(html).toContain('data-hub-scene="opening"');
    expect(html).toContain('id="open"');
    expect(html).toContain('data-hub-caption="51.44° N · 5.47° E · Eindhoven"');
  });

  test("frames the page with the field, the wordmark and the place", () => {
    const html = renderLayout(siteInfo);
    expect(html).toMatch(
      /<canvas[^>]*class="hub-field"[^>]*aria-hidden="true"/,
    );
    expect(html).toContain('aria-label="Rizom Hub Eindhoven home"');
    expect(html).toContain("rizom<b>/hub</b>");
    expect(html).toContain("Eindhoven");
    expect(html).toContain(">Chapter</p>");
  });

  test("offers the theme toggle and no menu of other pages", () => {
    const html = renderLayout(siteInfo);
    expect(html).toMatch(/<button[^>]*data-theme-toggle/);
    expect(html).not.toContain("/notes");
  });

  test("signs off with the commons and the way back to rizom.ai", () => {
    const html = renderLayout(siteInfo);
    expect(html).toContain(
      "The method, the platform and the Rizom mark are held by the Rizom Foundation as a commons.",
    );
    expect(html).toContain('href="https://rizom.ai"');
    expect(html).toContain('href="https://rizom.ai/work"');
    expect(html).toContain('href="https://rizom.ai/foundation"');
    expect(html).toContain("Rizom Hub Eindhoven");
  });

  test("leaves the framework's placeholder signature out", () => {
    const html = renderLayout({ ...siteInfo, copyright: "Powered by Rizom" });
    expect(html).not.toContain("Powered by Rizom");
  });

  test("ships the field's script and styles with the site", () => {
    expect((site.headScripts ?? []).join("\n")).toContain("data-hub-scene");
    expect(site.themeOverride).toContain(".hub-field");
  });
});
