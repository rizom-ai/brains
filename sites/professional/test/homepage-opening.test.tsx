import { describe, expect, it } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import {
  HomepageListLayout,
  type HomepageListData,
} from "../src/templates/homepage-list";
import { professionalSiteConfigSchema } from "../src/config";
import { professionalProfileSchema } from "../src/schemas";

const page: HomepageListData = {
  profile: professionalProfileSchema.parse({
    name: "Owner name",
    description: "Short metadata description",
    tagline: "Existing headline",
    intro: "Existing introduction",
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
};

describe("contact-first homepage", () => {
  it("is opt-in and preserves the existing page when unconfigured", () => {
    expect(professionalSiteConfigSchema.parse({}).homepageOpening).toBe(false);
    const html = renderToStaticMarkup(<HomepageListLayout {...page} />);
    expect(html).toContain("Existing headline");
    expect(html).not.toContain('href="/contact"');
  });
  it("keeps the page's own hero out when the opening does not load", () => {
    const html = renderToStaticMarkup(
      <HomepageListLayout {...page} homepageOpening opening={null} />,
    );
    expect(html).not.toContain("Existing headline");
    expect(html).not.toContain('href="/contact"');
  });
});
