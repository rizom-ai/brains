import { describe, expect, it } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import {
  openingFromProfile,
  organizationHomepageData,
} from "../src/datasources/homepage-datasource";
import { organizationProfileSchema } from "../src/schemas/organization-profile";
import type { AgentRadar, RadarAgent } from "../src/schemas/radar";
import { OrganizationHomepage } from "../src/templates/homepage";

const profile = organizationProfileSchema.parse({
  name: "Team Brain POC Team",
  description: "A small team validating shared knowledge capture.",
  tagline: "Shared knowledge, kept alive",
  website: "https://team.example.com",
});

function agent(
  id: string,
  name: string,
  kind: RadarAgent["kind"],
  x: number,
  y: number,
  extra: Partial<RadarAgent> = {},
): RadarAgent {
  return {
    id,
    entityType: "agent",
    content: "",
    metadata: { slug: `${id}-io` },
    name,
    kind,
    status: "approved",
    x,
    y,
    constellation: null,
    url: `/agents/${id}-io`,
    typeLabel: "Agent",
    ...extra,
  };
}

const radar: AgentRadar = {
  agents: [
    agent("partner", "Partner Brain", "team", 43, 27),
    agent("mara", "Mara Veld", "person", 93, 49),
    agent("field", "Field Notes Collective", "team", 79, 70, {
      constellation: "research",
    }),
    agent("commons", "Commons Lab", "organization", 51, 93, {
      constellation: "research",
    }),
    agent("old", "Old Agent", "team", 31, 21, { status: "discovered" }),
  ],
  constellations: [
    {
      id: "constellation:commons",
      name: "research",
      memberIds: ["commons", "field"],
      links: [{ from: "commons", to: "field" }],
      x: 65,
      y: 81.5,
    },
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
  const html = (map: AgentRadar | null = radar): string =>
    renderToStaticMarkup(
      <OrganizationHomepage
        profile={profile}
        opening={openingFromProfile(profile)}
        map={map}
        askBox={false}
      />,
    );
  const markOf = (name: string): string =>
    html()
      .split("<li ")
      .find((part) => part.includes(`<b>${name}</b>`)) ?? "";

  it("opens with the organization's own words", () => {
    expect(html()).toContain("Team Brain POC Team");
    expect(html()).toContain("Shared knowledge, kept alive");
    expect(html()).toContain(
      "A small team validating shared knowledge capture.",
    );
  });

  it("draws the radar in the map box, around the team at its centre", () => {
    expect(html()).toContain(
      'class="atlas__map atlas__map--supplied" role="group" aria-label="The people, teams and organizations we work with"',
    );
    expect(html().match(/class="scope__ring/g)?.length).toBeGreaterThan(3);
    expect(html()).toContain('class="scope__tick');
    expect(html()).toMatch(
      /class="radar__centre"><i aria-hidden="true"><\/i><span>Team Brain POC Team<\/span>/,
    );
    expect(html()).not.toContain("data-atlas-terrain");
    expect(html()).not.toContain("proximity-field");
  });

  it("names every agent beside its mark and links it to its page", () => {
    const partner = markOf("Partner Brain");
    expect(partner).toContain('class="atlas__mark atlas__mark--team');
    expect(partner).toContain('data-atlas-key="agent:partner"');
    expect(partner).toContain('href="/agents/partner-io"');
    expect(partner).toContain('class="radar__name">Partner Brain</span>');
    // Near the right edge, the name sits on the mark's left.
    expect(markOf("Mara Veld")).toContain(
      'class="radar__name radar__name--left">Mara Veld</span>',
    );
  });

  it("draws each constellation as a named echo, and each lone agent as an island", () => {
    expect(html()).toContain('class="echo echo--constellation"');
    expect(html()).toMatch(
      /class="atlas__zone radar__constellation"[^>]*>research</,
    );
    expect(html().match(/class="echo echo--lone/g)?.length).toBe(3);
    expect(markOf("Field Notes Collective")).toContain("<em>research</em>");
  });

  it("shows an agent awaiting review as an outline with a dashed island", () => {
    expect(markOf("Old Agent")).toContain("radar__mark--pending");
    expect(markOf("Old Agent")).toContain("Team, awaiting review");
    expect(html()).toContain('class="echo echo--lone echo--pending"');
  });

  it("lights nearer agents first as the pulse radiates from the team", () => {
    const delay = (name: string): number =>
      Number(/--pulse-at:([\d.]+)s/.exec(markOf(name))?.[1]);
    expect(delay("Partner Brain")).toBeLessThan(delay("Mara Veld"));
    expect(html()).toContain('class="radar__pulse"');
  });

  it("keys the legend to the kinds on the map", () => {
    const legend = html().split('class="atlas__legend"')[1] ?? "";
    expect(legend).toContain("Closer to the centre, closer to our work");
    for (const kind of ["Person", "Team", "Organization", "Awaiting review"]) {
      expect(legend).toContain(kind);
    }
  });

  it("has no door until a contact form can receive it", () => {
    expect(html()).not.toContain('class="atlas__door"');
    expect(html()).not.toContain("data-atlas-door");
  });

  it("keeps the opening when there is no radar", () => {
    const bare = html(null);
    expect(bare).toContain("Shared knowledge, kept alive");
    expect(bare).not.toContain('class="atlas__map');
  });
});

describe("organization homepage conversation", () => {
  const authored = {
    title: "Ask the team what it has learned",
    introduction: "We keep a shared memory and answer from it.",
    topics: ["Shared research"],
    topicsHeading: "Where would you start?",
    contactLabel: "Talk to the team",
    contactNote: null,
    attribution: "In our own words",
    mapCaption: null,
    contactUrl: "http://localhost:8080/contact",
  };

  it("opens with the authored words when the team has written them", () => {
    const data = organizationHomepageData({
      profile,
      authored,
      map: radar,
      askBox: false,
    });
    expect(data.opening).toBe(authored);
  });

  it("falls back to the anchor profile's words when nothing is authored", () => {
    const data = organizationHomepageData({
      profile,
      authored: null,
      map: radar,
      askBox: false,
    });
    expect(data.opening).toEqual(openingFromProfile(profile));
  });

  it("opens the door and docks the Ask box when both can receive a visitor", () => {
    const page = renderToStaticMarkup(
      <OrganizationHomepage
        {...organizationHomepageData({
          profile,
          authored,
          map: radar,
          askBox: true,
        })}
      />,
    );
    expect(page).toContain('class="atlas__door"');
    expect(page).toContain('href="http://localhost:8080/contact"');
    expect(page).toContain("Talk to the team");
    expect(page).toContain('data-ask-box=""');
    expect(page).toContain('src="/ask/assets/box.js"');
  });
});

describe("organization homepage caption", () => {
  it("names the map by the caption the team wrote", () => {
    const page = renderToStaticMarkup(
      <OrganizationHomepage
        profile={profile}
        opening={{
          ...openingFromProfile(profile),
          mapCaption: "Who we work with",
        }}
        map={radar}
        askBox={false}
      />,
    );
    expect(page).toContain('aria-label="Who we work with"');
    const legend = page.split('class="atlas__legend"')[1] ?? "";
    expect(legend).toContain("Who we work with");
    expect(legend).not.toContain("Closer to the centre, closer to our work");
  });
});
