import { describe, expect, it } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import type { HomepageAtlasData } from "@brains/site-atlas";
import { openingFromProfile } from "../src/datasources/homepage-datasource";
import { organizationProfileSchema } from "../src/schemas/organization-profile";
import { OrganizationHomepage } from "../src/templates/homepage";

const profile = organizationProfileSchema.parse({
  name: "Team Brain POC Team",
  description: "A small team validating shared knowledge capture.",
  tagline: "Shared knowledge, kept alive",
  website: "https://team.example.com",
});

function mark(
  id: string,
  title: string,
  glyph: "dot" | "diamond" | "square",
  kindLabel: string,
  x: number,
): HomepageAtlasData["items"][number] {
  return {
    id,
    entityType: "agent",
    glyph,
    kindLabel,
    content: "",
    metadata: { slug: `${id}-io` },
    title,
    year: null,
    x,
    y: 0.5,
    zoneId: null,
    url: `/agents/${id}-io`,
    typeLabel: "Agent",
  };
}

const atlas: HomepageAtlasData = {
  zones: [],
  centre: { name: "Team Brain POC Team", url: null },
  items: [
    mark("ada", "Ada", "dot", "Person", 0.75),
    mark("partner", "Partner Brain", "diamond", "Team", 0.2),
  ],
};

describe("opening from the anchor profile", () => {
  it("opens with the tagline and the introduction, with no door", () => {
    const opening = openingFromProfile(
      organizationProfileSchema.parse({
        name: "Team",
        tagline: "Shared knowledge, kept alive",
        intro: "We keep what the team learns.",
        description: "Short description",
      }),
    );
    expect(opening).toEqual({
      title: "Shared knowledge, kept alive",
      introduction: "We keep what the team learns.",
      topics: [],
      topicsHeading: null,
      contactLabel: null,
      contactNote: null,
      attribution: null,
      mapCaption: null,
      contactUrl: null,
    });
  });

  it("introduces the organization by its description when it has no introduction", () => {
    expect(openingFromProfile(profile).introduction).toBe(
      "A small team validating shared knowledge capture.",
    );
  });

  it("leaves out what the profile does not say", () => {
    const opening = openingFromProfile(
      organizationProfileSchema.parse({ name: "Team" }),
    );
    expect(opening.title).toBeNull();
    expect(opening.introduction).toBeNull();
  });
});

describe("organization homepage", () => {
  const html = (data: HomepageAtlasData | null = atlas): string =>
    renderToStaticMarkup(
      <OrganizationHomepage
        profile={profile}
        opening={openingFromProfile(profile)}
        atlas={data}
      />,
    );

  it("opens with the organization's own words", () => {
    expect(html()).toContain("Team Brain POC Team");
    expect(html()).toContain("Shared knowledge, kept alive");
    expect(html()).toContain(
      "A small team validating shared knowledge capture.",
    );
  });

  it("draws the agents around the organization, each linked to its page", () => {
    expect(html()).toContain('href="/agents/ada-io"');
    expect(html()).toContain('href="/agents/partner-io"');
    expect(html()).toContain("atlas__mark atlas__mark--dot");
    expect(html()).toContain("atlas__mark atlas__mark--diamond");
    expect(html()).toMatch(
      /class="atlas__centre"[^>]*>.*<span>Team Brain POC Team<\/span>/,
    );
    const legend = html().split('class="atlas__legend"')[1] ?? "";
    expect(legend).toContain("Person");
    expect(legend).toContain("Team");
  });

  it("names the map by what it shows", () => {
    expect(html()).toContain('aria-label="Map of the agent network"');
  });

  it("has no door until a contact form can receive it", () => {
    expect(html()).not.toContain('class="atlas__door"');
    expect(html()).not.toContain("data-atlas-door");
  });

  it("keeps the opening when there is no map", () => {
    const bare = html(null);
    expect(bare).toContain("Shared knowledge, kept alive");
    expect(bare).not.toContain('class="atlas__map"');
  });
});
