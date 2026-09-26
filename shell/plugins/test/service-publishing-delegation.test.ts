import { afterEach, describe, expect, it } from "bun:test";
import { createTestEntity } from "@brains/entity-service/test";
import { caughtError, createSilentLogger } from "@brains/test-utils";
import { z } from "@brains/utils/zod";
import {
  defineEntity,
  defineEntityPackage,
  defineServicePlugin,
  instantiatePluginPackageDefinition,
  PublishDelegationRegistry,
  type ServicePublishingAccess,
} from "../src";
import { createPluginHarness } from "../src/test/harness";

/**
 * A package that declares `publish` delegates publishing: something else
 * decides when its entity goes out, calls the provider, and records the
 * outcome — status, the timestamp, the provider's id — back on the entity.
 * The service doing that owns no entity types, so the runtime writes on its
 * behalf, and only for types whose own declaration asked for it. The same
 * holds for the generation job a `publishAssets` declaration names: it
 * belongs to a third package, and only the declaration makes queueing it
 * legitimate. Named consumer: @brains/content-pipeline.
 */
describe("delegated publish state", () => {
  const harness = createPluginHarness({
    logger: createSilentLogger("publishing-delegation-test"),
  });

  afterEach(async () => {
    await harness.reset();
    PublishDelegationRegistry.resetInstance();
  });

  const guide = defineEntity({
    type: "guide",
    purpose: "A guide.",
    metadata: z.object({
      title: z.string(),
      status: z.string().optional(),
      guideRef: z.string().optional(),
    }),
    publishAssets: [
      {
        attachmentType: "og-image",
        mediaEntityType: "image",
        targetEntityField: { location: "metadata", field: "ogImageId" },
        autoGenerate: true,
        jobType: "image:render",
      },
    ],
    publish: {
      provider: {
        name: "internal",
        publish: async (): Promise<{ id: string }> => ({ id: "sent" }),
      },
      resultIdField: "guideRef",
    },
  });

  /** The guides package, plus a service that publishes what it delegated. */
  async function installBoth(): Promise<ServicePublishingAccess> {
    for (const plugin of instantiatePluginPackageDefinition(
      defineEntityPackage({ id: "guides", entities: [guide] }),
      {},
      { name: "@fixture/guides", version: "0.1.0" },
    )) {
      await harness.installPlugin(plugin);
    }
    let captured: ServicePublishingAccess | undefined;
    const [service] = instantiatePluginPackageDefinition(
      defineServicePlugin({
        id: "pipeline",
        config: z.object({}),
        setup: ({ publishing }) => {
          captured = publishing;
          return {};
        },
      }),
      {},
      { name: "@fixture/pipeline", version: "0.1.0" },
    );
    if (!service) throw new Error("pipeline service was not created");
    await harness.installPlugin(service);
    if (!captured) throw new Error("setup did not run");
    return captured;
  }

  it("records the outcome on an entity whose package delegated publishing", async () => {
    const publishing = await installBoth();
    harness.addEntities([
      createTestEntity("guide", {
        id: "fishing",
        content: "How to fish",
        metadata: { title: "Fishing", status: "queued" },
      }),
    ]);
    const entity = await harness
      .getEntityService()
      .getEntity({ entityType: "guide", id: "fishing" });
    if (!entity) throw new Error("guide was not stored");

    expect(publishing.delegated("guide")).toBe(true);
    await publishing.update({
      ...entity,
      metadata: { ...entity.metadata, status: "published", guideRef: "sent" },
    });

    const updated = await harness
      .getEntityService()
      .getEntity({ entityType: "guide", id: "fishing" });
    expect(updated?.metadata["status"]).toBe("published");
    expect(updated?.metadata["guideRef"]).toBe("sent");
  });

  it("refuses a type whose package delegated nothing", async () => {
    const publishing = await installBoth();
    harness.addEntities([
      createTestEntity("note", { id: "loose", content: "A note" }),
    ]);
    const entity = await harness
      .getEntityService()
      .getEntity({ entityType: "note", id: "loose" });
    if (!entity) throw new Error("note was not stored");

    expect(publishing.delegated("note")).toBe(false);
    const error = await publishing
      .update(entity)
      .then(() => undefined)
      .catch((caught: unknown) => caughtError(caught));
    expect(error?.message).toContain("did not delegate publishing");

    const unchanged = await harness
      .getEntityService()
      .getEntity({ entityType: "note", id: "loose" });
    if (!unchanged) throw new Error("note was not stored");
    expect(unchanged.metadata).toEqual(entity.metadata);
  });

  it("queues the generation job the asset declaration named", async () => {
    const publishing = await installBoth();

    const jobId = await publishing.enqueueAsset({
      entityType: "guide",
      attachmentType: "og-image",
      data: { sourceEntityType: "guide", sourceEntityId: "fishing" },
      deduplicationKey: "publish-asset:og-image:guide:fishing",
    });

    expect(typeof jobId).toBe("string");
    const active = await harness
      .getMockShell()
      .getJobQueueService()
      .getActiveJobs();
    expect(active.map((job) => job.type)).toContain("image:render");
  });

  it("refuses an attachment type nobody declared", async () => {
    const publishing = await installBoth();

    const error = await publishing
      .enqueueAsset({
        entityType: "guide",
        attachmentType: "banner",
        data: {},
        deduplicationKey: "publish-asset:banner:guide:fishing",
      })
      .then(() => undefined)
      .catch((caught: unknown) => caughtError(caught));

    expect(error?.message).toContain("did not declare");
    const active = await harness
      .getMockShell()
      .getJobQueueService()
      .getActiveJobs();
    expect(active).toHaveLength(0);
  });
});
