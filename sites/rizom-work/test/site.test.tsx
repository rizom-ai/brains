/** @jsxImportSource react */
import { describe, expect, test } from "bun:test";
import { createElement, type ComponentType } from "react";
import { renderToStaticMarkup as render } from "react-dom/server";
import { z } from "@rizom/site";
import site, { workOrganism } from "../src";
import { WorkLayout } from "../src/layout";
import { workSections } from "../src/home";

const componentSchema = z.custom<ComponentType<Record<string, unknown>>>(
  (value) => typeof value === "function",
);
const propsSchema = z.record(z.string(), z.unknown());

const home = site.routes.find((entry) => entry.id === "home");

/** The home's chapters, rendered from the copy the package starts with. */
function renderHome(): string {
  return (home?.sections ?? [])
    .map((section) => {
      const name = section.template.split(":")[1] ?? "";
      const definition = workSections.sections[name];
      if (!definition) throw new Error(`no section ${section.template}`);
      return render(
        createElement(
          componentSchema.parse(definition.component),
          propsSchema.parse(definition.schema.parse(section.content)),
        ),
      );
    })
    .join("");
}

describe("rizom.work", () => {
  test("is one page, told as a story", () => {
    expect(site.routes.map((entry) => [entry.id, entry.path])).toEqual([
      ["home", "/"],
    ]);
  });

  test("runs through eight chapters, in the mockup's order", () => {
    expect((home?.sections ?? []).map((section) => section.id)).toEqual([
      "hero",
      "science",
      "problem",
      "hubs",
      "teams",
      "public",
      "partners",
      "contact",
    ]);
    const html = renderHome();
    expect(html.match(/<section [^>]*class="chapter"/g)).toHaveLength(8);
    for (const id of ["hubs", "teams", "public", "partners", "contact"]) {
      expect(html).toContain(`<section id="${id}" class="chapter"`);
    }
  });

  test("every chapter starts from copy of its own", () => {
    for (const section of home?.sections ?? []) {
      expect(section.content).toBeDefined();
    }
  });

  test("each dimension of the science reads as a whole sentence", () => {
    const html = renderHome();
    expect(html).toContain(
      "<dt>Specialization</dt><dd>Who knows what, and who is the only one who knows it",
    );
    expect(html).not.toContain("<dd>And who");
  });

  test("the offer to hubs and to teams is told in numbered steps, each ending on the contact form", () => {
    const html = renderHome();
    expect(html.match(/<ol class="steps">/g)).toHaveLength(2);
    expect(html).toContain("<b>A sponsor and a Brain for the hub.</b>");
    expect(html).toContain("<b>A setup at a fixed price.</b>");
    expect(html.match(/class="cta" href="\/contact\?topic=/g)).toHaveLength(2);
  });

  test("names no price, no client and no team member: those are not decided", () => {
    const html = renderHome();
    expect(html).not.toMatch(/€|EUR/);
    expect(html).not.toContain("Knowledge Audit");
  });

  test("the copy is in American spelling", () => {
    expect(renderHome()).not.toMatch(
      /organis(?!m)|programme|licence|centre\b/i,
    );
  });
});

describe("rizom.work's chrome and drawing", () => {
  const siteInfo = {
    title: "Rizom Work",
    description:
      "Brains for hubs and teams, set up and kept running by Rizom B.V.",
    url: "https://rizom.work",
    copyright: "© 2026 Rizom",
    navigation: { primary: [], secondary: [] },
  };
  const page = (path: string): string =>
    render(
      <WorkLayout
        sections={[]}
        title="Rizom Work"
        description={siteInfo.description}
        path={path}
        siteInfo={siteInfo}
      />,
    );

  test("is one of the three sites, in the practice's light", () => {
    const html = page("/");
    expect(html).toContain('<div data-room="work" class="relative">');
    expect(html).toMatch(
      /href="https:\/\/rizom\.work"[^>]*aria-current="true"/,
    );
    expect(html).toContain('aria-label="rizom.work"');
  });

  test("the bar's one call to action is the contact form", () => {
    const bar = page("/").slice(0, page("/").indexOf("</header>"));
    expect(bar).toMatch(/<a href="\/contact"[^>]*>Talk to us<\/a>/);
    expect(bar).not.toContain("Book an audit");
  });

  test("the footer's own column lists the offer, and names the license it works under", () => {
    const footer = page("/").slice(page("/").indexOf("<footer"));
    expect(footer).toMatch(/<a href="\/#hubs"[^>]*>For hubs<\/a>/);
    expect(footer).toMatch(/<a href="\/#teams"[^>]*>For teams<\/a>/);
    expect(footer).toContain(
      "Rizom B.V. runs hosting and client work under license from the Rizom Foundation",
    );
  });

  test("the home is told beside the drawing; the contact page is plain", () => {
    expect(page("/")).toContain('class="figure work-org" data-stage="0"');
    expect(page("/contact")).not.toContain("<figure");
  });

  test("the drawing has seven stages; the closing chapter keeps the last", () => {
    expect(workOrganism.stageCount).toBe(7);
  });

  test("the site serves its drawing's styles and no lexicons", () => {
    const assets = site.staticAssets ?? {};
    expect(assets["/styles/story.css"]).toContain(workOrganism.css());
    expect(
      Object.keys(assets).filter((path) => path.startsWith("/atproto/")),
    ).toEqual([]);
  });
});
