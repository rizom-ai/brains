import { afterEach, describe, expect, it } from "bun:test";
import { createSilentLogger } from "@brains/test-utils";
import { z } from "@brains/utils/zod";
import { createElement as h, type ReactElement } from "react";
import {
  defineServicePlugin,
  instantiatePluginPackageDefinition,
  type PluginCapabilities,
} from "../src";
import { createPluginHarness } from "../src/test/harness";

const sectionSchema = z.object({ heading: z.string() });

const configSchema = z.object({
  sections: z.array(
    z.object({
      name: z.string(),
      title: z.string(),
      namespace: z.string().optional(),
    }),
  ),
});

/**
 * Most templates are known when a package is written. A package whose whole
 * purpose is to turn an app's own configuration into renderable, generatable
 * page sections cannot name them in advance: the names, and how many there
 * are, come from the brain being composed.
 * Named consumer: @brains/site-content.
 */
describe("templates and views a package's configuration declares", () => {
  const harness = createPluginHarness({
    logger: createSilentLogger("configured-templates-test"),
  });

  afterEach(async () => {
    await harness.reset();
  });

  function install(
    sections: Array<{ name: string; title: string; namespace?: string }>,
  ): Promise<PluginCapabilities> {
    const [plugin] = instantiatePluginPackageDefinition(
      defineServicePlugin({
        id: "site-content",
        config: configSchema,
        templates: ({ config }) =>
          Object.fromEntries(
            config.sections.map((section) => [
              section.name,
              {
                schema: sectionSchema,
                permission: "public" as const,
                ...(section.namespace ? { namespace: section.namespace } : {}),
                format: ({ value }: { value: { heading: string } }): string =>
                  `# ${value.heading}`,
                parse: (content: string): { heading: string } => ({
                  heading: content.replace(/^# /u, ""),
                }),
              },
            ]),
          ),
        views: ({ config }) =>
          Object.fromEntries(
            config.sections.map((section) => [
              section.name,
              {
                schema: sectionSchema,
                description: section.title,
                renderers: {
                  web: ({ heading }: { heading: string }): ReactElement =>
                    h("h1", {}, heading),
                },
              },
            ]),
          ),
      }),
      { sections },
      { name: "@fixture/site-content", version: "0.1.0" },
    );
    if (!plugin) throw new Error("Service plugin was not created");
    return harness.installPlugin(plugin);
  }

  it("registers one template per configured section", async () => {
    await install([
      { name: "hero", title: "Hero" },
      { name: "features", title: "Features" },
    ]);

    const templates = harness.getTemplates();

    expect(templates.has("@fixture/site-content:site-content:hero")).toBe(true);
    expect(templates.has("@fixture/site-content:site-content:features")).toBe(
      true,
    );
  });

  /**
   * The sections belong to the site a brain composed, not to the package
   * that turned its configuration into templates: a route names them by the
   * namespace its author chose.
   */
  it("registers under the namespace the section named", async () => {
    await install([{ name: "hero", title: "Hero", namespace: "landing-page" }]);

    const templates = harness.getTemplates();

    expect(templates.has("landing-page:hero")).toBe(true);
    expect(templates.has("@fixture/site-content:site-content:hero")).toBe(
      false,
    );
  });

  it("keeps the section's own permission rather than assuming admin", async () => {
    await install([{ name: "hero", title: "Hero" }]);

    expect(
      harness.getTemplates().get("@fixture/site-content:site-content:hero")
        ?.requiredPermission,
    ).toBe("public");
  });

  it("reads back what it wrote, because a section round-trips", async () => {
    await install([{ name: "hero", title: "Hero" }]);
    const template = harness
      .getTemplates()
      .get("@fixture/site-content:site-content:hero");
    if (!template) throw new Error("The hero section was not registered");

    const markdown = template.formatter?.format({ heading: "Welcome" });

    expect(markdown).toBe("# Welcome");
    expect(template.formatter?.parse(markdown ?? "")).toEqual({
      heading: "Welcome",
    });
  });
});
