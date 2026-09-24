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

describe("professional site atlas script", () => {
  async function homepageTemplate(
    config: ConstructorParameters<typeof ProfessionalSitePlugin>[0],
  ): Promise<
    ReturnType<
      ReturnType<
        PluginTestHarness<ProfessionalSitePlugin>["getTemplates"]
      >["get"]
    >
  > {
    const harness = createPluginHarness<ProfessionalSitePlugin>({
      dataDir: "/tmp/test-professional-site-atlas-script",
    });
    await harness.installPlugin(new ProfessionalSitePlugin(config));
    return harness.getTemplates().get("professional-site:homepage-list");
  }

  it("ships the touch and motion script only to sites that opt into the atlas", async () => {
    const atlas = await homepageTemplate({ homepageOpening: true });
    const src = atlas?.runtimeScripts?.[0]?.src;
    expect(src).toBe("/scripts/homepage-atlas.js");
    expect(atlas?.staticAssets?.[src ?? ""]).toContain("data-atlas");

    const plain = await homepageTemplate({});
    expect(plain?.runtimeScripts ?? []).toEqual([]);
  });
});
