import { describe, expect, it } from "bun:test";
import { z } from "@brains/utils/zod";
import { TemplateCapabilities } from "@brains/templates";
import {
  createPluginHarness,
  type PluginTestHarness,
} from "@brains/plugins/test";
import { ProfessionalSitePlugin } from "../src/plugin";
import { routes } from "../src/routes";
import { aboutHighlightsSchema } from "../src/schemas";

const sample = {
  headline: "Builds durable tools for small teams",
  summary:
    "Ada designs systems that keep working after the people who built them move on. Her recent work centres on declarative services.",
  themes: ["Durability", "Declarative design", "Small teams"],
};

describe("professional site about highlights", () => {
  async function installPlugin(): Promise<
    PluginTestHarness<ProfessionalSitePlugin>
  > {
    const harness = createPluginHarness<ProfessionalSitePlugin>({
      dataDir: "/tmp/test-professional-site-about-highlights",
    });
    await harness.installPlugin(new ProfessionalSitePlugin({}));
    return harness;
  }

  it("is the site's generatable section: AI-backed, knowledge-aware, and renderable", async () => {
    const harness = await installPlugin();
    const template = harness
      .getTemplates()
      .get("professional-site:about-highlights");
    if (!template) throw new Error("Template not registered");

    expect(TemplateCapabilities.getCapabilities(template)).toMatchObject({
      canGenerate: true,
      canRender: true,
    });
    expect(template.useKnowledgeContext).toBe(true);
    expect(template.requiredPermission).toBe("public");
    // What the provider is asked to produce: the full field set, not an
    // empty schema, which OpenAI rejects outright.
    expect(z.toJSONSchema(template.schema, { io: "input" })).toMatchObject({
      type: "object",
      required: ["headline", "summary", "themes"],
    });
  });

  it("round-trips generated output through its formatter", async () => {
    const harness = await installPlugin();
    const template = harness
      .getTemplates()
      .get("professional-site:about-highlights");
    const formatter = template?.formatter;
    if (!formatter) throw new Error("Template has no formatter");

    const markdown = formatter.format(sample);
    expect(markdown).toContain(sample.headline);
    expect(aboutHighlightsSchema.parse(formatter.parse(markdown))).toEqual(
      sample,
    );
  });

  it("appears on the about route as a section with no static content", () => {
    const about = routes.find((route) => route.id === "about");
    const section = about?.sections?.find(
      (candidate) => candidate.id === "highlights",
    );
    // No content and no dataQuery: the section renders only once generated,
    // so site-content_generate has a real target in every default site.
    expect(section).toEqual({
      id: "highlights",
      template: "professional-site:about-highlights",
    });
  });
});
