import { describe, expect, it } from "bun:test";
import {
  createPluginHarness,
  type PluginTestHarness,
} from "@brains/plugins/test";
import { ProfessionalSitePlugin } from "../src/plugin";

const profileWithTransitionalKind = {
  name: "Ada Morgan",
  kind: "professional",
  description: "Systems researcher",
};

describe("professional site template schemas", () => {
  async function installPlugin(): Promise<
    PluginTestHarness<ProfessionalSitePlugin>
  > {
    const harness = createPluginHarness<ProfessionalSitePlugin>({
      dataDir: "/tmp/test-professional-site-template-schemas",
    });
    await harness.installPlugin(new ProfessionalSitePlugin({}));
    return harness;
  }

  it("accepts datasource profiles with transitional kind on the homepage", async () => {
    const harness = await installPlugin();
    const template = harness
      .getTemplates()
      .get("professional-site:homepage-list");

    const result = template?.schema.safeParse({
      profile: profileWithTransitionalKind,
      posts: [],
      decks: [],
      postsListUrl: "/essays",
      decksListUrl: "/presentations",
      cta: {
        heading: "Let's work together",
        buttonText: "Get in touch",
        buttonLink: "mailto:ada@example.com",
      },
      sections: {},
    });

    expect(result?.success).toBe(true);
  });

  it("accepts datasource profiles with transitional kind on the about page", async () => {
    const harness = await installPlugin();
    const template = harness.getTemplates().get("professional-site:about");

    const result = template?.schema.safeParse({
      profile: profileWithTransitionalKind,
    });

    expect(result?.success).toBe(true);
  });
});
