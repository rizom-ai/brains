import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import {
  publishRegisterContract,
  publishRequestContract,
} from "@brains/contracts";
import {
  createPluginHarness,
  type PluginTestHarness,
} from "@brains/plugins/test";
import {
  createContentPipelinePlugin,
  type ContentPipelineTestPlugin,
} from "./content-pipeline-plugins";

/**
 * A way in that has its own confirmation, such as a command a person chose
 * in their notes app, asks the pipeline to publish an entry now. The
 * pipeline does what its publish action does once confirmed.
 */
describe("a request to publish an entry now", () => {
  let harness: PluginTestHarness<ContentPipelineTestPlugin>;
  let plugin: ContentPipelineTestPlugin;
  let published: string[];

  beforeEach(async () => {
    harness = createPluginHarness({ dataDir: "/tmp/test-datadir" });
    // This brain lets its trusted people publish, and nobody else.
    const shell = harness.getMockShell();
    const permissions = shell.getPermissionService();
    shell.getPermissionService = (): typeof permissions => permissions;
    permissions.assertEntityActionAllowed = (_type, action, asker): void => {
      if (action === "publish" && asker === "public") {
        throw new Error("Only trusted people publish here");
      }
    };
    plugin = createContentPipelinePlugin({});
    await harness.installPlugin(plugin);
    published = [];
    harness.addEntities([
      {
        id: "tea",
        entityType: "post",
        content: "---\ntitle: Tea\nstatus: draft\n---\n\nSteep it.",
        metadata: { status: "draft", title: "Tea" },
        visibility: "public",
      },
      {
        id: "out",
        entityType: "post",
        content: "---\ntitle: Out\nstatus: published\n---\n\nAlready.",
        metadata: { status: "published", title: "Out" },
        visibility: "public",
      },
    ]);
    await harness.sendMessage(publishRegisterContract.name, {
      entityType: "post",
      provider: {
        name: "site",
        publish: async (content: string) => {
          published.push(content);
          return { id: "site-tea", url: "https://example.com/tea" };
        },
      },
    });
  });

  afterEach(async () => {
    await plugin.shutdown();
  });

  const ask = (
    id: string,
    permissionLevel: "admin" | "trusted" | "public" = "admin",
  ): Promise<unknown> =>
    harness.sendMessage(publishRequestContract.name, {
      entityType: "post",
      id,
      userId: "usr_ada",
      permissionLevel,
    });

  it("publishes it through its provider and marks it published", async () => {
    const answer = await ask("tea");

    expect(answer).toEqual({
      published: true,
      url: "https://example.com/tea",
    });
    expect(published).toHaveLength(1);
    const entity = await harness
      .getEntityService()
      .getEntity({ entityType: "post", id: "tea" });
    expect(entity?.metadata["status"]).toBe("published");
  });

  /** A refusal is no answer on the bus, and says why in words the asker may show. */
  const refusal = (
    id: string,
    permissionLevel: "admin" | "trusted" | "public" = "admin",
  ): Promise<unknown> =>
    harness
      .getMockShell()
      .getMessageBus()
      .send({
        type: publishRequestContract.name,
        payload: { entityType: "post", id, userId: "usr_ada", permissionLevel },
        sender: "test",
      });

  it("refuses an entry that is not ready, with the reason", async () => {
    expect(await ask("out")).toBeUndefined();
    expect(await refusal("out")).toMatchObject({
      success: false,
      error: "Entity is already published",
    });
    expect(await refusal("nothing")).toMatchObject({
      success: false,
      error: "Entity not found: post:nothing",
    });
    expect(published).toEqual([]);
  });

  it("refuses a person who may not publish", async () => {
    expect(await refusal("tea", "public")).toMatchObject({
      success: false,
      error: "Only trusted people publish here",
    });
    expect(published).toEqual([]);
    const entity = await harness
      .getEntityService()
      .getEntity({ entityType: "post", id: "tea" });
    expect(entity?.metadata["status"]).toBe("draft");
  });
});
