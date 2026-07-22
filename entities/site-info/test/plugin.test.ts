import { describe, it, expect, beforeEach } from "bun:test";
import { createPluginHarness } from "@brains/plugins/test";
import {
  SITE_METADATA_GET_CHANNEL,
  SITE_METADATA_UPDATED_CHANNEL,
} from "@brains/site-composition";
import { SiteInfoPlugin } from "../src/plugin";

describe("SiteInfoPlugin", () => {
  let harness: ReturnType<typeof createPluginHarness>;

  beforeEach(() => {
    harness = createPluginHarness({ dataDir: "/tmp/test-site-info" });
  });

  it("should register as entity plugin", async () => {
    const plugin = new SiteInfoPlugin();
    await harness.installPlugin(plugin);

    expect(plugin.type).toBe("entity");
    expect(plugin.id).toBe("site-info");
  });

  it("should register site-info entity type", async () => {
    const plugin = new SiteInfoPlugin();
    await harness.installPlugin(plugin);

    expect(harness.getEntityService().getEntityTypes()).toContain("site-info");
  });

  it("should return zero tools", async () => {
    const plugin = new SiteInfoPlugin();
    const capabilities = await harness.installPlugin(plugin);

    expect(capabilities.tools).toHaveLength(0);
  });

  it("should register datasource", async () => {
    const plugin = new SiteInfoPlugin();
    await harness.installPlugin(plugin);

    const dataSources = harness.getDataSources();
    const ids = Array.from(dataSources.keys());
    expect(ids.some((id) => id.includes("site-info"))).toBe(true);
  });

  it("should provide site metadata over the shared provider channel", async () => {
    const plugin = new SiteInfoPlugin({
      siteInfo: {
        title: "Provider Site",
        description: "Provided metadata",
      },
    });
    await harness.installPlugin(plugin);

    const data = await harness.sendMessage(
      SITE_METADATA_GET_CHANNEL,
      undefined,
    );

    expect(data).toMatchObject({
      title: "Provider Site",
      description: "Provided metadata",
    });
  });

  it("derives metadata from the anchor when site-info is absent", async () => {
    await harness.installPlugin(new SiteInfoPlugin());

    const data = await harness.sendMessage(
      SITE_METADATA_GET_CHANNEL,
      undefined,
    );

    expect(data).toMatchObject({
      represents: "anchor",
      title: "Test Owner",
    });
  });

  it("derives missing metadata from the represented brain", async () => {
    await harness.installPlugin(new SiteInfoPlugin());
    await harness.getEntityService().createEntity({
      entity: {
        id: "site-info",
        entityType: "site-info",
        content: "---\nrepresents: brain\n---\n",
        metadata: {},
      },
    });

    const data = await harness.sendMessage(
      SITE_METADATA_GET_CHANNEL,
      undefined,
    );

    expect(data).toMatchObject({
      represents: "brain",
      title: "Test Brain",
    });
  });

  it("defaults missing representation and metadata to the anchor", async () => {
    await harness.installPlugin(new SiteInfoPlugin());
    await harness.getEntityService().createEntity({
      entity: {
        id: "site-info",
        entityType: "site-info",
        content: "---\n---\n",
        metadata: {},
      },
    });

    const data = await harness.sendMessage(
      SITE_METADATA_GET_CHANNEL,
      undefined,
    );

    expect(data).toMatchObject({
      represents: "anchor",
      title: "Test Owner",
    });
  });

  it("should emit shared metadata update events when site-info changes", async () => {
    const plugin = new SiteInfoPlugin();
    await harness.installPlugin(plugin);

    let updateCount = 0;
    harness.subscribe(SITE_METADATA_UPDATED_CHANNEL, () => {
      updateCount++;
      return { success: true };
    });

    await harness.sendMessage("entity:updated", {
      entityType: "site-info",
      entityId: "site-info",
    });

    expect(updateCount).toBe(1);
  });
});
