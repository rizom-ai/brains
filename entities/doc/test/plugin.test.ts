import { describe, expect, it } from "bun:test";
import { createPluginHarness } from "@brains/plugins/test";
import { z } from "@brains/utils/zod";
import { DocsPlugin } from "../src/plugin";

describe("DocsPlugin", () => {
  it("retires sourcePath, which nothing reads", async () => {
    const harness = createPluginHarness<DocsPlugin>({
      dataDir: "/tmp/test-docs-retired",
    });
    await harness.installPlugin(new DocsPlugin());

    expect(
      harness.getEntityRegistry().getEntityTypeConfig("doc").retiredFields,
    ).toEqual(["sourcePath"]);
    await harness.reset();
  });

  async function docsPage(
    plugin: DocsPlugin,
    template: string,
  ): Promise<Record<string, unknown>> {
    const harness = createPluginHarness<DocsPlugin>({
      dataDir: "/tmp/test-docs-presentation",
    });
    await harness.installPlugin(plugin);
    const schema = harness.getTemplates().get(template)?.schema;
    const source = harness.getDataSources().get("docs:entities");
    if (!schema || !source?.fetch) throw new Error("docs not registered");
    const data = await source.fetch({}, schema, {
      entityService: harness.getEntityService(),
    });
    await harness.reset();
    return z.record(z.string(), z.unknown()).parse(data);
  }

  it("hands its configured hero and chrome to the docs pages", async () => {
    const hero = { title: "Build, run, and publish", accent: "brains." };
    const chrome = { brand: { label: "brains docs", href: "/docs" } };

    const page = await docsPage(
      new DocsPlugin({ hero, chrome }),
      "docs:doc-list",
    );

    expect(page["hero"]).toMatchObject(hero);
    expect(page["chrome"]).toMatchObject(chrome);
  });

  it("hands no hero or chrome to the docs pages when none is configured", async () => {
    const page = await docsPage(new DocsPlugin(), "docs:doc-list");

    expect(page["hero"]).toBeNull();
    expect(page["chrome"]).toBeNull();
  });
});
