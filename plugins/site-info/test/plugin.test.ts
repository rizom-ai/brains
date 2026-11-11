import { describe, it, expect, beforeEach } from "bun:test";
import { createPluginHarness } from "@brains/plugins/test";
import {
  SITE_METADATA_UPDATED_CHANNEL,
  siteMetadataContract,
  siteMetadataUpdatedChannel,
} from "@brains/site-composition";
import siteInfoPackage from "../src";
import { siteInfoPlugins } from "./site-info-plugin";
import { SYSTEM_CHANNELS } from "@brains/plugins";

async function install(
  harness: ReturnType<typeof createPluginHarness>,
  config: Parameters<typeof siteInfoPlugins>[0] = {},
): Promise<{ tools: number }> {
  let tools = 0;
  for (const plugin of siteInfoPlugins(config)) {
    tools += (await harness.installPlugin(plugin)).tools.length;
  }
  return { tools };
}

describe("site-info", () => {
  let harness: ReturnType<typeof createPluginHarness>;

  beforeEach(() => {
    harness = createPluginHarness({ dataDir: "/tmp/test-site-info" });
  });

  it("default-exports its service package definition", () => {
    expect(siteInfoPackage).toMatchObject({
      kind: "rizom-plugin-package",
      family: "service",
      id: "site-metadata",
    });
  });

  it("installs the site-info type under the plugin id its class had, and the service beside it", () => {
    expect(
      siteInfoPlugins().map(({ id, type, packageName }) => [
        id,
        type,
        packageName,
      ]),
    ).toEqual([
      ["site-info", "entity", "@brains/site-info"],
      ["site-metadata", "service", "@brains/site-info"],
    ]);
  });

  it("should register site-info entity type", async () => {
    await install(harness);

    expect(harness.getEntityService().getEntityTypes()).toContain("site-info");
  });

  it("should return zero tools", async () => {
    const { tools } = await install(harness);

    expect(tools).toBe(0);
  });

  it("should register datasource", async () => {
    await install(harness);

    const dataSources = harness.getDataSources();
    const ids = Array.from(dataSources.keys());
    expect(ids.some((id) => id.includes("site-info"))).toBe(true);
  });

  it("should provide site metadata over the shared provider channel", async () => {
    await install(harness, {
      siteInfo: {
        title: "Provider Site",
        description: "Provided metadata",
      },
    });

    const data = await harness.sendMessage(siteMetadataContract.name, {});

    expect(data).toMatchObject({
      title: "Provider Site",
      description: "Provided metadata",
    });
  });

  it("derives metadata from the anchor when site-info is absent", async () => {
    await install(harness);

    const data = await harness.sendMessage(siteMetadataContract.name, {});

    expect(data).toMatchObject({
      represents: "anchor",
      title: "Test Owner",
    });
  });

  it("derives missing metadata from the represented brain", async () => {
    await install(harness);
    await harness.getEntityService().createEntity({
      entity: {
        id: "site-info",
        entityType: "site-info",
        content: "---\nrepresents: brain\n---\n",
        // Stored as the declared type stores it: its frontmatter is its
        // metadata. A row an earlier release wrote, with empty metadata, is
        // re-derived at startup (the runtime test covers it).
        metadata: { represents: "brain" },
      },
    });

    const data = await harness.sendMessage(siteMetadataContract.name, {});

    expect(data).toMatchObject({
      represents: "brain",
      title: "Test Brain",
    });
  });

  it("defaults missing representation and metadata to the anchor", async () => {
    await install(harness);
    await harness.getEntityService().createEntity({
      entity: {
        id: "site-info",
        entityType: "site-info",
        content: "---\n---\n",
        metadata: {},
      },
    });

    const data = await harness.sendMessage(siteMetadataContract.name, {});

    expect(data).toMatchObject({
      represents: "anchor",
      title: "Test Owner",
    });
  });

  it("should emit shared metadata update events when site-info changes", async () => {
    await install(harness);

    const updates: unknown[] = [];
    harness.subscribe(SITE_METADATA_UPDATED_CHANNEL, (message) => {
      updates.push(message.payload);
      return { success: true };
    });

    await harness.sendMessage("entity:updated", {
      entityType: "site-info",
      entityId: "site-info",
    });

    expect(updates).toHaveLength(1);
    // What site-info announces is what the channel's subscribers take.
    expect(
      siteMetadataUpdatedChannel.schema.safeParse(updates[0]).success,
    ).toBe(true);
  });

  it("ignores a change to another entity type", async () => {
    await install(harness);

    let updateCount = 0;
    harness.subscribe(SITE_METADATA_UPDATED_CHANNEL, () => {
      updateCount++;
      return { success: true };
    });

    await harness.sendMessage("entity:updated", {
      entityType: "note",
      entityId: "site-info",
    });

    expect(updateCount).toBe(0);
  });

  it("re-announces site metadata when the worker syncs a site-info change", async () => {
    await install(harness);

    let updateCount = 0;
    harness.subscribe(SITE_METADATA_UPDATED_CHANNEL, () => {
      updateCount++;
      return { success: true };
    });

    await harness.getMockShell().getMessageBus().deliverPeer("entity:updated", {
      entityType: "site-info",
      entityId: "site-info",
    });

    expect(updateCount).toBe(1);
  });
});

describe("site-info's default record", () => {
  async function installed(
    config: Parameters<typeof siteInfoPlugins>[0] = {},
  ): Promise<ReturnType<typeof createPluginHarness>> {
    const harness = createPluginHarness({ dataDir: "/tmp/test-site-info" });
    for (const plugin of siteInfoPlugins(config)) {
      await harness.installPlugin(plugin);
    }
    return harness;
  }

  it("is created once the initial sync completes, from the configured defaults", async () => {
    const harness = await installed({ siteInfo: { title: "Configured" } });
    const entityService = harness.getEntityService();
    expect(
      await entityService.getEntity({
        entityType: "site-info",
        id: "site-info",
      }),
    ).toBeNull();

    await harness.sendMessage(SYSTEM_CHANNELS.initialSyncCompleted, {
      success: true,
    });

    const created = await entityService.getEntity({
      entityType: "site-info",
      id: "site-info",
    });
    expect(created?.metadata).toEqual({
      represents: "anchor",
      title: "Configured",
    });
    expect(created?.visibility).toBe("public");
  });

  it("is created after an initial sync that failed too, as the class did", async () => {
    const harness = await installed();

    await harness.sendMessage(SYSTEM_CHANNELS.initialSyncCompleted, {
      success: false,
      error: "remote unreachable",
    });

    expect(
      await harness
        .getEntityService()
        .getEntity({ entityType: "site-info", id: "site-info" }),
    ).not.toBeNull();
  });

  it("leaves a site-info the sync imported", async () => {
    const harness = await installed();
    harness.addEntities([
      {
        id: "site-info",
        entityType: "site-info",
        content: "---\ntitle: Imported\n---\n",
        metadata: { title: "Imported" },
      },
    ]);

    await harness.sendMessage(SYSTEM_CHANNELS.initialSyncCompleted, {
      success: true,
    });

    const kept = await harness
      .getEntityService()
      .getEntity({ entityType: "site-info", id: "site-info" });
    expect(kept?.metadata).toEqual({ title: "Imported" });
  });

  it("refuses a configured default the site-info schema refuses", () => {
    const config = { siteInfo: { represents: "nobody" } };
    expect(() => siteInfoPlugins(config)).toThrow(/represents/);
  });
});
