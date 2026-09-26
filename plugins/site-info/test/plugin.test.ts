import { describe, it, expect, beforeEach } from "bun:test";
import { createPluginHarness } from "@brains/plugins/test";
import {
  SITE_METADATA_GET_CHANNEL,
  SITE_METADATA_UPDATED_CHANNEL,
} from "@brains/site-composition";
import { siteInfoPlugins, PACKAGE_METADATA } from "./helpers/install";

describe("site-info package", () => {
  let harness: ReturnType<typeof createPluginHarness>;

  beforeEach(() => {
    harness = createPluginHarness({ dataDir: "/tmp/test-site-info" });
  });

  /** Install the service plugin and the entity plugin it declares. */
  async function install(): Promise<void> {
    for (const plugin of siteInfoPlugins()) {
      await harness.installPlugin(plugin);
    }
  }

  it("emits a service plugin and the entity plugin for its type", () => {
    const plugins = siteInfoPlugins();
    expect(plugins.map((plugin) => plugin.type)).toEqual(["service", "entity"]);
    expect(plugins.map((plugin) => plugin.id)).toEqual([
      `${PACKAGE_METADATA.name}:site-metadata`,
      `${PACKAGE_METADATA.name}:site-info`,
    ]);
  });

  it("registers the site-info entity type", async () => {
    await install();
    expect(harness.getEntityService().getEntityTypes()).toContain("site-info");
  });

  it("registers no tools", async () => {
    const [service] = siteInfoPlugins();
    if (!service) throw new Error("Site-info service plugin was not created");
    const capabilities = await harness.installPlugin(service);
    expect(capabilities.tools).toHaveLength(0);
  });

  it("registers its data source", async () => {
    await install();
    const ids = Array.from(harness.getDataSources().keys());
    expect(ids.some((id) => id.includes("site-info"))).toBe(true);
  });

  it("derives metadata from the anchor when site-info is absent", async () => {
    await install();

    const data = await harness.sendMessage(SITE_METADATA_GET_CHANNEL, {});

    expect(data).toMatchObject({ represents: "anchor", title: "Test Owner" });
  });

  it("derives missing metadata from the represented brain", async () => {
    await install();
    await harness.getEntityService().createEntity({
      entity: {
        id: "site-info",
        entityType: "site-info",
        content: "---\nrepresents: brain\n---\n",
        metadata: { represents: "brain" },
      },
    });

    const data = await harness.sendMessage(SITE_METADATA_GET_CHANNEL, {});

    expect(data).toMatchObject({ represents: "brain", title: "Test Brain" });
  });

  it("prefers what the site says about itself", async () => {
    await install();
    await harness.getEntityService().createEntity({
      entity: {
        id: "site-info",
        entityType: "site-info",
        content: "---\nrepresents: anchor\ntitle: Provider Site\n---\n",
        metadata: { represents: "anchor", title: "Provider Site" },
      },
    });

    const data = await harness.sendMessage(SITE_METADATA_GET_CHANNEL, {});

    expect(data).toMatchObject({ title: "Provider Site" });
  });

  it("announces what a change to the singleton now means", async () => {
    await install();

    const announced: unknown[] = [];
    harness.subscribe(SITE_METADATA_UPDATED_CHANNEL, (message) => {
      announced.push(message.payload);
      return { success: true };
    });

    await harness.sendMessage("entity:updated", {
      entityType: "note",
      entityId: "n-1",
    });
    expect(announced).toHaveLength(0);

    await harness.sendMessage("entity:updated", {
      entityType: "site-info",
      entityId: "site-info",
    });
    expect(announced).toHaveLength(1);
    expect(announced[0]).toMatchObject({ title: "Test Owner" });
  });
});
