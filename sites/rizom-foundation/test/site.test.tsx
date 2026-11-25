/** @jsxImportSource react */
import { describe, expect, test } from "bun:test";
import { createElement, type ComponentType } from "react";
import { renderToStaticMarkup as render } from "react-dom/server";
import {
  z,
  type RouteDefinitionInput,
  type SiteSectionGroup,
} from "@rizom/site";
import site, { foundationOrganism } from "../src";
import { FoundationLayout } from "../src/layout";
import { foundationSections } from "../src/home";
import { readingSections } from "../src/reading";

const componentSchema = z.custom<ComponentType<Record<string, unknown>>>(
  (value) => typeof value === "function",
);
const propsSchema = z.record(z.string(), z.unknown());

const route = (id: string): RouteDefinitionInput => {
  const found = site.routes.find((entry) => entry.id === id);
  if (!found) throw new Error(`no route ${id}`);
  return found;
};

const groups: Record<string, SiteSectionGroup> = {
  foundation: foundationSections,
  reading: readingSections,
};

/** A route's sections, rendered from the copy the package starts with. */
function renderRoute(id: string): string {
  return (route(id).sections ?? [])
    .map((section) => {
      const [namespace = "", name = ""] = section.template.split(":");
      const definition = groups[namespace]?.sections[name];
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

describe("rizom.foundation", () => {
  test("has a home told as a story and two reading pages", () => {
    expect(site.routes.map((entry) => [entry.id, entry.path])).toEqual([
      ["home", "/"],
      ["common-sense", "/common-sense"],
      ["support", "/support"],
    ]);
  });

  test("the home runs through eight chapters, in the mockup's order", () => {
    expect((route("home").sections ?? []).map((section) => section.id)).toEqual(
      [
        "hero",
        "writing",
        "mission",
        "events",
        "support",
        "why",
        "board",
        "follow",
      ],
    );
    const html = renderRoute("home");
    expect(html.match(/<section [^>]*class="chapter"/g)).toHaveLength(8);
    for (const id of ["writing", "events", "support", "board"]) {
      expect(html).toContain(`<section id="${id}" class="chapter"`);
    }
  });

  test("every section starts from copy of its own, so the site stands before its content repo does", () => {
    for (const entry of site.routes) {
      for (const section of entry.sections ?? []) {
        expect(section.content).toBeDefined();
      }
    }
  });

  test("members' writing points to each article on its author's own Brain", () => {
    const html = renderRoute("home");
    expect(html).toContain(
      '<a href="https://yeehaa.io/essays/scale-without-a-center">',
    );
    expect(html).toContain("<b>Scale Without a Center</b>");
  });

  test("the three figures are set large, each with what it counts", () => {
    const html = renderRoute("home");
    expect(html).toContain('<dl class="figures">');
    expect(html).toContain("<dt>15+</dt><dd><b>Brains in use</b>");
    expect(html).toContain('href="/styles/foundation.css"');
  });

  test("the board is named, with each member's role", () => {
    const html = renderRoute("home");
    expect(html).toContain(
      "<li><b>Annebeth Wilton</b><span>Secretary · independent</span></li>",
    );
    expect(html.match(/· independent<\/span>/g)).toHaveLength(4);
  });

  test("the founding ask names no deadline", () => {
    const html = renderRoute("home") + renderRoute("support");
    expect(html).toContain("€50,000");
    expect(html).not.toMatch(/31 December|deadline/i);
  });

  test("Common Sense reads as one column: its five assumptions numbered, its goals as a ledger", () => {
    const html = renderRoute("common-sense");
    expect(html).toContain("<h1>Common Sense</h1>");
    expect(html.match(/<li>/g)).toHaveLength(5);
    expect(html).toContain('<ol class="reading__assumptions">');
    expect(html).toContain('<dl class="reading__goals">');
    expect(html).toContain('<p class="reading__mission">');
    expect(html).toContain('href="/support"');
  });

  test("the founding-supporters page ends on the pledge and a way back to Common Sense", () => {
    const html = renderRoute("support");
    expect(html).toContain("<h1>Become a founding supporter</h1>");
    expect(html).toContain("mailto:yeehaa@rizom.ai?subject=Founding%20pledge");
    expect(html).toContain('<a href="/common-sense">Read Common Sense</a>');
  });

  test("the copy is in American spelling", () => {
    const html = ["home", "common-sense", "support"].map(renderRoute).join("");
    expect(html).not.toMatch(/organis(?!m)|programme|licence|centre\b/i);
  });
});

describe("rizom.foundation's chrome and drawing", () => {
  const siteInfo = {
    title: "Rizom Foundation",
    description: "A think tank that builds.",
    url: "https://rizom.foundation",
    copyright: "© 2026 Rizom",
    navigation: { primary: [], secondary: [] },
  };
  const page = (path: string): string =>
    render(
      <FoundationLayout
        sections={[]}
        title="Rizom Foundation"
        description={siteInfo.description}
        path={path}
        siteInfo={siteInfo}
      />,
    );

  test("is one of the three sites, in the Foundation's light on every page", () => {
    for (const path of ["/", "/common-sense", "/support"]) {
      const html = page(path);
      expect(html).toContain('<div data-room="foundation" class="relative">');
      expect(html).toMatch(
        /href="https:\/\/rizom\.foundation"[^>]*aria-current="true"/,
      );
      expect(html).toContain('aria-label="rizom.foundation"');
    }
  });

  test("the bar asks for founding support, in one word on a phone", () => {
    const html = page("/");
    expect(html).toContain(">Become a founding supporter</span>");
    expect(html).toContain(">Pledge</span>");
  });

  test("only the home is told beside the drawing", () => {
    expect(page("/")).toContain('class="figure foundation-org" data-stage="0"');
    expect(page("/common-sense")).not.toContain("<figure");
  });

  test("the drawing has six stages; the board and the follow chapters keep the last", () => {
    expect(foundationOrganism.stageCount).toBe(6);
    expect(page("/")).toContain('data-stages="6"');
  });

  test("the site serves its drawing's styles and its own stylesheet, and no lexicons", () => {
    const assets = site.staticAssets ?? {};
    expect(assets["/styles/story.css"]).toContain(foundationOrganism.css());
    expect(assets["/styles/foundation.css"]).toContain(".reading {");
    expect(assets["/styles/foundation.css"]).toContain(".figures {");
    expect(
      Object.keys(assets).filter((path) => path.startsWith("/atproto/")),
    ).toEqual([]);
  });
});
