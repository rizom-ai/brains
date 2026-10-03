import { describe, expect, it } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { createPluginHarness } from "@brains/plugins/test";
import type { SiteLayoutInfo } from "@brains/site-composition";
import { ProfessionalSitePlugin } from "../src/plugin";
import { SiteLayout, type HomepageAtlasData } from "@brains/site-atlas";
import {
  HomepageListLayout,
  type HomepageListData,
} from "../src/templates/homepage-list";
import { professionalProfileSchema } from "../src/schemas";

/**
 * Pins what the professional site ships around the atlas, so moving the
 * atlas into a shared package cannot change a single byte of it.
 */

const atlas: HomepageAtlasData = {
  zones: [
    {
      id: "institutions",
      name: "New institutions",
      x: 0.5,
      y: 0.4,
      members: 2,
    },
    { id: "memory", name: "Living memory", x: 0.2, y: 0.7, members: 1 },
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
      latest: false,
    },
    {
      id: "living",
      entityType: "deck",
      content: "",
      metadata: { slug: "organizations-as-living-systems" },
      title: "Organizations as Living Systems",
      year: 2026,
      x: 0.47,
      y: 0.38,
      zoneId: "institutions",
      url: "/presentations/organizations-as-living-systems",
      typeLabel: "Presentation",
      latest: false,
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
      latest: false,
    },
    {
      id: "offcourse",
      entityType: "project",
      content: "",
      metadata: { slug: "offcourse" },
      title: "Offcourse",
      year: 2013,
      x: 0.2,
      y: 0.72,
      zoneId: "memory",
      url: null,
      typeLabel: null,
      latest: false,
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
    title: "Building something *inhabitable*.",
    introduction: "I work on how institutions hold what they know.",
    topics: ["Someone who carries a lot is about to leave", "A second thread"],
    contactUrl: "https://yeehaa.test/contact",
    topicsHeading: "Pick a thread",
    contactLabel: "Write to me",
    contactNote: "I read these myself.",
    mapCaption: "My published work, by topic",
    faqHeading: null,
  },
};

const siteInfo: SiteLayoutInfo = {
  title: "yeehaa",
  description: "Building something inhabitable.",
  url: "https://yeehaa.test",
  copyright: "© 2026 yeehaa",
  navigation: {
    primary: [{ label: "About", href: "/about", priority: 90 }],
    secondary: [{ label: "Home", href: "/", priority: 10 }],
  },
  socialLinks: [
    {
      platform: "github",
      url: "https://github.com/yeehaa123",
      label: "GitHub",
    },
  ],
};

describe("professional homepage pin", () => {
  it("renders the atlas homepage", () => {
    expect(
      renderToStaticMarkup(<HomepageListLayout {...page} atlas={atlas} />),
    ).toMatchSnapshot();
  });

  it("renders the atlas homepage with the Ask box docked", () => {
    expect(
      renderToStaticMarkup(
        <HomepageListLayout {...page} atlas={atlas} askBox />,
      ),
    ).toMatchSnapshot();
  });

  it("renders the opening without a map", () => {
    expect(
      renderToStaticMarkup(<HomepageListLayout {...page} atlas={null} />),
    ).toMatchSnapshot();
  });

  it("renders the site layout", () => {
    expect(
      renderToStaticMarkup(
        <SiteLayout
          sections={[<p key="section">Section</p>]}
          title="Home"
          description="Home page"
          path="/"
          siteInfo={siteInfo}
        />,
      ),
    ).toMatchSnapshot();
  });

  it("ships the atlas script with the opted-in homepage", async () => {
    const harness = createPluginHarness<ProfessionalSitePlugin>({
      dataDir: "/tmp/test-professional-homepage-pin",
    });
    await harness.installPlugin(
      new ProfessionalSitePlugin({ homepageOpening: true }),
    );
    const template = harness
      .getTemplates()
      .get("professional-site:homepage-list");
    expect({
      runtimeScripts: template?.runtimeScripts,
      staticAssets: template?.staticAssets,
    }).toMatchSnapshot();
  });
});
