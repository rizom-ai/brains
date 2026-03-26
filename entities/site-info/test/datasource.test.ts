import { describe, it, expect } from "bun:test";
import { SiteInfoDataSource } from "../src/datasources/site-info-datasource";
import { createSilentLogger } from "@brains/test-utils";
import { createMockShell } from "@brains/plugins/test";
import { z } from "@brains/utils";

const outputSchema = z.record(z.unknown());

describe("SiteInfoDataSource", () => {
  it("should have correct id", () => {
    const ds = new SiteInfoDataSource(createSilentLogger());
    expect(ds.id).toBe("site-info:entities");
  });

  it("should return defaults when no entity exists", async () => {
    const ds = new SiteInfoDataSource(createSilentLogger());
    const shell = createMockShell();
    const entityService = shell.getEntityService();

    const result = await ds.fetch({}, outputSchema, { entityService });

    expect(result["title"]).toBe("Personal Brain");
    expect(result["description"]).toBe("A knowledge management system");
    expect(result["copyright"]).toBe("Powered by Rizom");
  });

  it("should return entity data when site-info exists", async () => {
    const ds = new SiteInfoDataSource(createSilentLogger());
    const shell = createMockShell();
    shell.addEntities([
      {
        id: "site-info",
        entityType: "site-info",
        content:
          "---\ntitle: My Brain\ndescription: My knowledge base\ncopyright: © Me\n---\n",
        contentHash: "abc",
        metadata: {},
        created: new Date().toISOString(),
        updated: new Date().toISOString(),
      },
    ]);
    const entityService = shell.getEntityService();

    const result = await ds.fetch({}, outputSchema, { entityService });

    expect(result["title"]).toBe("My Brain");
    expect(result["description"]).toBe("My knowledge base");
    expect(result["copyright"]).toBe("© Me");
  });

  it("should include socialLinks from profile entity", async () => {
    const ds = new SiteInfoDataSource(createSilentLogger());
    const shell = createMockShell();
    shell.addEntities([
      {
        id: "site-info",
        entityType: "site-info",
        content: "---\ntitle: Test\ndescription: Desc\n---\n",
        contentHash: "abc",
        metadata: {},
        created: new Date().toISOString(),
        updated: new Date().toISOString(),
      },
      {
        id: "anchor-profile",
        entityType: "anchor-profile",
        content: "",
        contentHash: "def",
        metadata: {
          socialLinks: [{ platform: "github", url: "https://github.com/test" }],
        },
        created: new Date().toISOString(),
        updated: new Date().toISOString(),
      },
    ]);
    const entityService = shell.getEntityService();

    const result = await ds.fetch({}, outputSchema, { entityService });

    const socialLinks = result["socialLinks"] as Array<{
      platform: string;
      url: string;
    }>;
    expect(socialLinks).toHaveLength(1);
    expect(socialLinks[0]?.platform).toBe("github");
  });
});
