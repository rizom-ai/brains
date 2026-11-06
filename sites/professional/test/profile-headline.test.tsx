import { describe, expect, it } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { professionalProfileSchema } from "../src/schemas";
import { AboutPageLayout } from "../src/templates/about";
import {
  HomepageListLayout,
  type HomepageListData,
} from "../src/templates/homepage-list";

const ada = {
  name: "Ada Morgan",
  description: "Advises on resilient systems",
  headline: "Advisor on resilient systems | Climate tech",
  industry: "Software Development",
  location: "Amsterdam, Netherlands",
};

describe("professional about page", () => {
  const about = (input: Record<string, unknown>): string =>
    renderToStaticMarkup(
      <AboutPageLayout profile={professionalProfileSchema.parse(input)} />,
    );

  it("sets the headline under the name, above the description", () => {
    const html = about(ada);
    const headline = html.indexOf(ada.headline);
    expect(headline).toBeGreaterThan(html.indexOf(">About Ada Morgan</h1>"));
    expect(html.indexOf(ada.description)).toBeGreaterThan(headline);
  });

  it("lists industry and location among the facts", () => {
    const html = about(ada);
    expect(html).toContain(">Industry</h2>");
    expect(html).toContain("Software Development");
    expect(html).toContain(">Location</h2>");
    expect(html).toContain("Amsterdam, Netherlands");
  });

  it("leaves headline, industry and location out when unset", () => {
    const html = about({ name: "Ada Morgan" });
    expect(html).not.toContain(">Industry</h2>");
    expect(html).not.toContain(">Location</h2>");
    expect(html).toBe(
      about({ name: "Ada Morgan", headline: "", industry: "", location: "" }),
    );
  });
});

describe("professional editorial homepage", () => {
  const home = (input: Record<string, unknown>): string => {
    const page: HomepageListData = {
      profile: professionalProfileSchema.parse(input),
      posts: [],
      decks: [],
      postsListUrl: "/essays",
      decksListUrl: "/presentations",
      sections: {},
      cta: {
        heading: "Keep in touch",
        buttonText: "Email",
        buttonLink: "mailto:ada@example.com",
      },
    };
    return renderToStaticMarkup(<HomepageListLayout {...page} />);
  };
  const heroHeading = (html: string): string | undefined =>
    /<h1[^>]*>(.*?)<\/h1>/.exec(html)?.[1];

  it("leads with the tagline when there is one", () => {
    expect(heroHeading(home({ ...ada, tagline: "Building resilient" }))).toBe(
      "Building resilient",
    );
  });

  it("falls back to the headline before the description", () => {
    expect(heroHeading(home(ada))).toBe(
      "Advisor on resilient systems | Climate tech",
    );
    expect(heroHeading(home({ ...ada, tagline: "" }))).toBe(
      "Advisor on resilient systems | Climate tech",
    );
  });

  it("uses the description when there is neither", () => {
    expect(heroHeading(home({ ...ada, headline: null }))).toBe(
      "Advises on resilient systems",
    );
  });
});
