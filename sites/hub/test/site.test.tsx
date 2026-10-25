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

  test("tells the story in order, the why after the opening", () => {
    expect(site.routes[0]?.sections?.map((section) => section.id)).toEqual([
      "opening",
      "pipeline",
      "programs",
      "memory",
      "labs",
      "fit",
    ]);
  });

  test("tells the pipeline in the design's words, numbered 01", () => {
    const html = renderSection("pipeline");
    expect(html).toContain('data-hub-scene="pipeline"');
    expect(html).toContain('data-hub-label="01"');
    expect(html).toContain("Innovation runs <em>one way</em>.");
    expect(html).toContain(
      "The way we organize innovation was built for the center.",
    );
    expect(html).toContain("left the region, and took what they learned");
    expect(html).toContain("&quot;center&quot;:&quot;The center&quot;");
  });

  test("tells how programs end, with the connector's button", () => {
    const html = renderSection("programs");
    expect(html).toContain('data-hub-scene="programs"');
    expect(html).toContain('data-hub-label="02"');
    expect(html).toContain("Every program starts <em>from zero</em>.");
    expect(html).toMatch(
      /<button[^>]*data-hub-connector[^>]*>Let the connector leave<\/button>/,
    );
    expect(html).toContain("&quot;connector&quot;:&quot;The connector&quot;");
  });

  test("tells the hub that remembers, with its Brain switch and sparkline", () => {
    const html = renderSection("memory");
    expect(html).toContain('data-hub-scene="memory"');
    expect(html).toContain('data-hub-label="03"');
    expect(html).toContain(
      "Each cohort starts where the last <em>stopped</em>.",
    );
    expect(html).toMatch(
      /<button[^>]*data-hub-memory="on"[^>]*aria-pressed="true"[^>]*>With a Brain<\/button>/,
    );
    expect(html).toMatch(
      /<button[^>]*data-hub-memory="off"[^>]*aria-pressed="false"[^>]*>Without<\/button>/,
    );
    expect(html).toMatch(/<path class="hub-spark__with" d="M8.0,62.0/);
  });

  test("tells a lab's six months, phase by phase, with its price", () => {
    const html = renderSection("labs");
    expect(html).toContain('data-hub-scene="labs"');
    expect(html).toContain('data-hub-label="04"');
    expect(html).toContain('id="labs"');
    expect(html).toContain("A lab, not a <em>desk</em>.");
    expect(html).toContain("Weeks 1–3");
    expect(html).toContain("The audit");
    expect(html).toContain("The organization takes its Brain home");
    expect(html.match(/data-hub-phase="/g)).toHaveLength(4);
    expect(html).toContain("The Rizom Lab");
    expect(html).toContain("€49,600 excl. VAT, the same in every hub");
    expect(html).toContain("&quot;week&quot;:&quot;Week {week} / 26&quot;");
  });

  test("tells how the hub fits into Rizom: five holders and the split", () => {
    const html = renderSection("fit");
    expect(html).toContain('data-hub-scene="fit"');
    expect(html).toContain('data-hub-label="05"');
    expect(html).toContain("Each holds what it <em>should</em>.");
    expect(html.match(/<button[^>]*data-hub-holder="/g)).toHaveLength(5);
    expect(html).toContain("Rizom Foundation");
    expect(html).toContain(
      "Holds the method, the platform and the mark as a commons that cannot be sold.",
    );
    expect(html).toContain("60% delivery · Rizom B.V.");
    expect(html).toContain("25% commons");
    expect(html).toContain(
      "&quot;bv&quot;:&quot;Rizom B.V. · setup, hosting, delivery&quot;",
    );
  });

  test("gives the reader a rail of chapters to jump between", () => {
    expect(renderLayout(siteInfo)).toMatch(
      /<ol class="hub-rail" aria-label="Chapters">/,
    );
  });

  test("ships the field's script and styles with the site", () => {
    expect((site.headScripts ?? []).join("\n")).toContain("data-hub-scene");
    expect(site.themeOverride).toContain(".hub-field");
  });
});
