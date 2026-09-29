import { describe, expect, it } from "bun:test";
import { createElement as h, type ReactElement } from "react";
import { z } from "@brains/utils/zod";
import { createPluginHarness } from "../src/test/harness";
import {
  defineServicePlugin,
  instantiatePluginPackageDefinition,
} from "../src";

/**
 * One declaration per template, whatever it can do.
 *
 * A template and a view used to be separate slots that the runtime merged by
 * key, refusing the pair unless both named the exact same schema object. That
 * is one capability written twice: the same name, the same schema, and a rule
 * to keep the halves in agreement. A template now says how it formats, how it
 * renders, or both.
 */
describe("a template that formats and renders", () => {
  const digest = z.object({ heading: z.string(), words: z.number() });

  const install = async (): Promise<
    Awaited<ReturnType<typeof harness.installPlugin>>
  > => {
    const [plugin] = instantiatePluginPackageDefinition(
      defineServicePlugin(
        { id: "reading", config: z.object({}) },
        {
          templates: {
            digest: {
              schema: digest,
              description: "A compact reading digest.",
              permission: "public" as const,
              format: ({ value }) => `# ${value.heading}`,
              parse: (content: string) => ({
                heading: content.replace(/^# /u, ""),
                words: 0,
              }),
              render: ({ heading }): ReactElement => h("h1", {}, heading),
            },
          },
        },
      ),
      {},
      { name: "@fixture/reading", version: "0.1.0" },
    );
    if (!plugin) throw new Error("Service plugin was not created");
    return harness.installPlugin(plugin);
  };

  const harness = createPluginHarness();

  it("registers one template carrying both the formatter and the renderer", async () => {
    await install();

    const template = harness
      .getTemplates()
      .get("@fixture/reading:reading:digest");
    if (!template) throw new Error("Template was not registered");

    expect(template.description).toBe("A compact reading digest.");
    expect(template.requiredPermission).toBe("public");
    expect(template.formatter?.format({ heading: "Weekly", words: 3 })).toBe(
      "# Weekly",
    );
    expect(template.layout?.component).toBeDefined();

    await harness.reset();
  });

  it("registers a template that only formats", async () => {
    const [plugin] = instantiatePluginPackageDefinition(
      defineServicePlugin(
        { id: "notes", config: z.object({}) },
        {
          templates: {
            summary: {
              schema: digest,
              format: ({ value }) => `${value.words} words`,
            },
          },
        },
      ),
      {},
      { name: "@fixture/notes", version: "0.1.0" },
    );
    if (!plugin) throw new Error("Service plugin was not created");
    await harness.installPlugin(plugin);

    const template = harness.getTemplates().get("@fixture/notes:notes:summary");
    if (!template) throw new Error("Template was not registered");

    expect(template.formatter?.format({ heading: "x", words: 7 })).toBe(
      "7 words",
    );
    expect(template.layout).toBeUndefined();

    await harness.reset();
  });
});
