import { describe, it, expect } from "bun:test";
import { createPluginHarness } from "@brains/plugins/test";
import { z } from "@brains/utils/zod";
import { siteInfoPlugins } from "./site-info-plugin";

const outputSchema = z.record(z.string(), z.unknown());

async function installed(): Promise<ReturnType<typeof createPluginHarness>> {
  const harness = createPluginHarness();
  for (const plugin of siteInfoPlugins()) await harness.installPlugin(plugin);
  return harness;
}

async function fetchSiteInfo(
  harness: ReturnType<typeof createPluginHarness>,
): Promise<Record<string, unknown>> {
  const source = harness.getDataSources().get("site-info:entities");
  if (!source?.fetch) throw new Error("No site-info:entities data source");
  return source.fetch({}, outputSchema, {
    entityService: harness.getEntityService(),
  });
}

describe("the site-info data source", () => {
  it("registers under the id its class had", async () => {
    const harness = await installed();
    expect([...harness.getDataSources().keys()]).toEqual([
      "site-info:entities",
    ]);
  });

  it("should return defaults when no entity exists", async () => {
    const result = await fetchSiteInfo(await installed());

    expect(result["title"]).toBe("Brain");
    expect(result["description"]).toBe("A knowledge management system");
    expect(result["copyright"]).toBe("Powered by Rizom");
  });

  it("should return entity data when site-info exists", async () => {
    const harness = await installed();
    harness.addEntities([
      {
        id: "site-info",
        entityType: "site-info",
        content:
          "---\ntitle: My Brain\ndescription: My knowledge base\ncopyright: © Me\n---\n",
        contentHash: "abc",
        visibility: "public",
        // Stored as the declared type stores it: its frontmatter is its
        // metadata.
        metadata: {
          title: "My Brain",
          description: "My knowledge base",
          copyright: "© Me",
        },
      },
    ]);

    const result = await fetchSiteInfo(harness);

    expect(result["title"]).toBe("My Brain");
    expect(result["description"]).toBe("My knowledge base");
    expect(result["copyright"]).toBe("© Me");
  });

  it("does not mix anchor profile data into site channel configuration", async () => {
    const harness = await installed();
    harness.addEntities([
      {
        id: "site-info",
        entityType: "site-info",
        content: "---\ntitle: Test\ndescription: Desc\n---\n",
        contentHash: "abc",
        visibility: "public",
        metadata: { title: "Test", description: "Desc" },
      },
      {
        id: "anchor-profile",
        entityType: "anchor-profile",
        content: "",
        contentHash: "def",
        visibility: "public",
        metadata: {
          socialLinks: [{ platform: "github", url: "https://github.com/test" }],
        },
      },
    ]);

    const result = await fetchSiteInfo(harness);

    expect(result["socialLinks"]).toBeUndefined();
  });
});
