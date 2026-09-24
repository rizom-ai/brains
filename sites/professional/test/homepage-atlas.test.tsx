import { describe, expect, it } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import type { BaseEntity } from "@brains/plugins";
import { loadHomepageAtlas } from "../src/datasources/homepage-atlas";
import {
  HomepageListLayout,
  type HomepageListData,
} from "../src/templates/homepage-list";
import { professionalProfileSchema } from "../src/schemas";
import type { HomepageAtlasData } from "../src/schemas/homepage-atlas";
import { homepageAtlasStyles } from "../src/templates/homepage-atlas-styles";

function entity(
  entityType: string,
  id: string,
  metadata: Record<string, unknown>,
  content = `# ${String(metadata["title"] ?? id)}`,
): BaseEntity {
  return {
    id,
    entityType,
    visibility: "public",
    content,
    metadata,
    contentHash: id,
    created: "2026-01-01T00:00:00.000Z",
    updated: "2026-01-01T00:00:00.000Z",
  };
}

/** What the build's scoped entity service returns: drafts are already gone. */
const listed: Record<string, BaseEntity[]> = {
  topic: [entity("topic", "institutions", {}, "# New institutions")],
  post: [
    entity("post", "hiding", {
      title: "Hiding in Plain Sight",
      slug: "hiding-in-plain-sight",
      publishedAt: "2026-06-03T09:00:00.000Z",
    }),
  ],
  deck: [
    entity("deck", "living", {
      title: "Organizations as Living Systems",
      slug: "organizations-as-living-systems",
      publishedAt: "2026-04-27T09:00:00.000Z",
    }),
  ],
  project: [
    entity("project", "lefthoek", {
      title: "Lefthoek",
      slug: "lefthoek",
      year: 2020,
    }),
  ],
  base: [entity("base", "scratch", { title: "Scratch note" })],
};

function point(
  entityType: string,
  entityId: string,
  x: number,
  y: number,
): {
  entityType: string;
  entityId: string;
  coordinates: [number, number];
  distanceToOrigin: number;
} {
  return { entityType, entityId, coordinates: [x, y], distanceToOrigin: 0 };
}

const projection = {
  points: [
    point("topic", "institutions", 0, 0),
    point("post", "hiding", 0.02, 0.01),
    point("post", "the-machine-finds-the-cracks", 0.03, 0.02),
    point("deck", "living", -0.02, 0.02),
    point("project", "lefthoek", 4, 4),
    point("base", "scratch", 0.01, -0.01),
  ],
};

function source(
  project = async (): Promise<typeof projection> => projection,
): Parameters<typeof loadHomepageAtlas>[0] {
  return {
    semantic: { project },
    entityService: {
      listEntities: async ({ entityType }) => listed[entityType] ?? [],
    },
  };
}

describe("homepage atlas data", () => {
  it("places only published essays, talks and projects, with what links need", async () => {
    const atlas = await loadHomepageAtlas(source());
    const ids = atlas?.items.map((item) => `${item.entityType}:${item.id}`);
    expect(ids?.sort()).toEqual([
      "deck:living",
      "post:hiding",
      "project:lefthoek",
    ]);
    const essay = atlas?.items.find((item) => item.id === "hiding");
    expect(essay?.metadata.slug).toBe("hiding-in-plain-sight");
    expect(essay?.title).toBe("Hiding in Plain Sight");
    expect(essay?.year).toBe(2026);
    expect(atlas?.items.find((item) => item.id === "lefthoek")?.year).toBe(
      2020,
    );
    for (const item of atlas?.items ?? []) {
      expect(item.x).toBeGreaterThanOrEqual(0);
      expect(item.x).toBeLessThanOrEqual(1);
    }
  });

  it("keeps a territory only while it holds a shown item", async () => {
    const atlas = await loadHomepageAtlas(source());
    expect(atlas?.zones.map((zone) => zone.name)).toEqual(["New institutions"]);
    // Counts shown items only: the projected draft next to it is not one.
    const filed = atlas?.items.filter((item) => item.zoneId === "institutions");
    expect(filed?.length).toBeGreaterThan(0);
    expect(atlas?.zones[0]?.members).toBe(filed?.length);
  });

  it("omits the map when the projection is unavailable", async () => {
    const failing = source(async () => {
      throw new Error("embeddings disabled");
    });
    expect(await loadHomepageAtlas(failing)).toBeNull();
  });

  it("omits the map when nothing published is projected", async () => {
    const empty = source(async () => ({
      points: [point("topic", "institutions", 0, 0)],
    }));
    expect(await loadHomepageAtlas(empty)).toBeNull();
  });
});

const atlas: HomepageAtlasData = {
  zones: [
    {
      id: "institutions",
      name: "New institutions",
      x: 0.5,
      y: 0.4,
      members: 2,
    },
  ],
  items: [
    {
      id: "hiding",
      entityType: "post",
      content: "",
      metadata: { slug: "hiding-in-plain-sight" },
      title: "Hiding in Plain Sight",
      year: 2026,
      x: 0.52,
      y: 0.42,
      zoneId: "institutions",
      url: "/essays/hiding-in-plain-sight",
      typeLabel: "Essay",
    },
    {
      id: "lefthoek",
      entityType: "project",
      content: "",
      metadata: { slug: "lefthoek" },
      title: "Lefthoek",
      year: 2020,
      x: 0.9,
      y: 0.9,
      zoneId: null,
      url: "/projects/lefthoek",
      typeLabel: "Project",
    },
    {
      id: "offcourse",
      entityType: "project",
      content: "",
      metadata: { slug: "offcourse" },
      title: "Offcourse",
      year: 2013,
      x: 0.05,
      y: 0.6,
      zoneId: null,
      url: "/projects/offcourse",
      typeLabel: "Project",
    },
  ],
};

const page: HomepageListData = {
  profile: professionalProfileSchema.parse({
    name: "Jan Hein Hoogstad",
    description: "Short metadata description",
    tagline: "Existing headline",
  }),
  posts: [],
  decks: [],
  postsListUrl: "/essays",
  decksListUrl: "/presentations",
  sections: {},
  cta: {
    heading: "Keep in touch",
    buttonText: "Email",
    buttonLink: "mailto:owner@example.com",
  },
  homepageOpening: true,
  opening: {
    title: "Building something inhabitable.",
    introduction: "I work on how institutions hold what they know.",
    topics: ["Someone who carries a lot is about to leave"],
    contactUrl: "https://yeehaa.test/contact",
    topicsHeading: "Pick a thread",
    contactLabel: "Write to me",
    contactNote: "I read these myself.",
    attribution: "In my own words",
    mapCaption: "My published work, by topic",
  },
};

describe("homepage atlas", () => {
  it("opens with the authored turn and a working door over the map", () => {
    const html = renderToStaticMarkup(
      <HomepageListLayout {...page} atlas={atlas} />,
    );
    expect(html).toContain("Building something inhabitable.");
    expect(html).toContain("I work on how institutions hold what they know.");
    expect(html).toContain("Jan Hein Hoogstad");
    expect(html).toContain('href="https://yeehaa.test/contact"');
    expect(html).toContain("Someone who carries a lot is about to leave");
    expect(html).not.toContain("Existing headline");
    expect(html).not.toContain("View all essays");
  });

  it("draws the terrain and links every mark to its page", () => {
    const html = renderToStaticMarkup(
      <HomepageListLayout {...page} atlas={atlas} />,
    );
    expect(html).toContain("<svg");
    expect(html).toContain("<path");
    expect(html).toContain("New institutions");
    expect(html).toContain('href="/essays/hiding-in-plain-sight"');
    expect(html).toContain("Hiding in Plain Sight");
    expect(html).toContain('href="/projects/lefthoek"');
    expect(html).toContain("Essay");
  });

  it("works without JavaScript and starts no chat", () => {
    const html = renderToStaticMarkup(
      <HomepageListLayout {...page} atlas={atlas} />,
    );
    expect(html).not.toContain("<script");
    expect(html).not.toContain("textarea");
    expect(html).not.toContain("/guest");
  });

  it("keeps the opening and door when there is no map", () => {
    const html = renderToStaticMarkup(
      <HomepageListLayout {...page} atlas={null} />,
    );
    expect(html).toContain("Building something inhabitable.");
    expect(html).toContain('href="https://yeehaa.test/contact"');
    expect(html).not.toContain("<svg");
  });
});

describe("living atlas", () => {
  const html = (): string =>
    renderToStaticMarkup(<HomepageListLayout {...page} atlas={atlas} />);

  it("drifts each ring on its own phase so the terrain shifts, with crisp lines", () => {
    expect(homepageAtlasStyles).toContain("@keyframes atlas-drift");
    const delays = html().match(/animation-delay:-?[\d.]+s/g) ?? [];
    expect(delays.length).toBeGreaterThan(3);
    expect(new Set(delays).size).toBe(delays.length);
    expect(html()).not.toContain("feDisplacementMap");
  });

  it("holds the terrain still for visitors who prefer reduced motion", () => {
    expect(homepageAtlasStyles).toMatch(
      /prefers-reduced-motion: reduce\)[^}]*\.atlas__contour \{ animation: none; \}/,
    );
  });

  it("marks the parts the touch script needs", () => {
    expect(html()).toContain("data-atlas=");
    expect(html()).toContain("data-atlas-terrain");
    expect(html().match(/data-atlas-mark/g)?.length).toBe(atlas.items.length);
  });

  it("anchors title cards inward at both edges so they stay on screen", () => {
    expect(html()).toContain("atlas__mark--west");
    expect(html()).toContain("atlas__mark--east");
  });
});

describe("atlas hover on touch screens", () => {
  it("shows hover cards only where a pointer really hovers, never as sticky touch hover", () => {
    const hoverBlock = homepageAtlasStyles.indexOf("@media (hover: hover)");
    expect(hoverBlock).toBeGreaterThan(-1);
    for (const rule of [":hover .atlas__tip", ":hover .atlas__glyph"]) {
      const first = homepageAtlasStyles.indexOf(rule);
      expect(first).toBeGreaterThan(hoverBlock);
    }
  });
});

describe("atlas copy", () => {
  it("uses the words the owner wrote around the door and the map", () => {
    const html = renderToStaticMarkup(
      <HomepageListLayout {...page} atlas={atlas} />,
    );
    for (const words of [
      "Pick a thread",
      "Write to me",
      "I read these myself.",
      "In my own words",
      "My published work, by topic",
    ]) {
      expect(html).toContain(words);
    }
  });

  it("leaves out words nobody wrote and names the button plainly", () => {
    const opening = {
      ...page.opening,
      title: "Building something inhabitable.",
      introduction: null,
      topics: [],
      contactUrl: "https://yeehaa.test/contact",
      topicsHeading: null,
      contactLabel: null,
      contactNote: null,
      attribution: null,
      mapCaption: null,
    };
    const html = renderToStaticMarkup(
      <HomepageListLayout {...page} opening={opening} atlas={atlas} />,
    );
    for (const fixed of [
      "Where would you start?",
      "Let’s talk",
      "A private note to the owner",
      "Written, not generated",
      "Everything published here",
    ]) {
      expect(html).not.toContain(fixed);
    }
    expect(html).toContain('href="https://yeehaa.test/contact">Contact</a>');
    expect(html).not.toContain('class="atlas__caption"');
    expect(html).not.toContain('class="atlas__note"');
  });
});
