import { afterEach, describe, expect, it } from "bun:test";
import {
  AtprotoProjectionRegistry,
  canonicalAtprotoLexicons,
} from "@brains/atproto-contracts";
import { createTestEntity } from "@brains/entity-service/test";
import { createSilentLogger } from "@brains/test-utils";
import { z } from "@brains/utils/zod";
import {
  defineEntity,
  defineEntityPackage,
  instantiatePluginPackageDefinition,
} from "../src";
import { createPluginHarness } from "../src/test/harness";

/**
 * An entity's AT Protocol projection is that package's code: when a record
 * lands it writes the record's address back onto its own entity. The atproto
 * service that calls it owns no types and may not write anyone's, so the
 * runtime binds the projection to the declaring package's access when it
 * registers it, and ignores whatever the caller hands over. Named consumer:
 * @brains/atproto, which could not otherwise call `onPublished` at all.
 */
describe("declared atproto projections", () => {
  const harness = createPluginHarness({
    logger: createSilentLogger("atproto-projection-context-test"),
  });

  afterEach(async () => {
    await harness.reset();
    AtprotoProjectionRegistry.resetInstance();
  });

  it("run with the declaring package's own entity access, whoever calls them", async () => {
    const guide = defineEntity({
      type: "guide",
      purpose: "A guide.",
      metadata: z.object({
        title: z.string(),
        atprotoUri: z.string().optional(),
      }),
      atproto: {
        entityType: "guide",
        collection: "ai.rizom.brain.series",
        lexicon: canonicalAtprotoLexicons["ai.rizom.brain.series"],
        buildRecord: async ({ entity, context }) => {
          const found = await context.entityService.getEntity({
            entityType: "guide",
            id: entity.id,
          });
          return { $type: "ai.rizom.brain.series", title: found?.id ?? "" };
        },
        onPublished: async ({ entity, context, uri }) => {
          await context.entityService.updateEntity({
            entity: {
              ...entity,
              metadata: { ...entity.metadata, atprotoUri: uri },
            },
          });
        },
      },
    });
    for (const plugin of instantiatePluginPackageDefinition(
      defineEntityPackage({ id: "guides", entities: [guide] }),
      {},
      { name: "@fixture/guides", version: "0.1.0" },
    )) {
      await harness.installPlugin(plugin);
    }
    harness.addEntities([
      createTestEntity("guide", {
        id: "fishing",
        content: "How to fish",
        metadata: { title: "Fishing" },
      }),
    ]);
    const entity = await harness
      .getEntityService()
      .getEntity({ entityType: "guide", id: "fishing" });
    if (!entity) throw new Error("guide was not stored");

    const projection = AtprotoProjectionRegistry.getInstance().get("guide");
    if (!projection?.onPublished) throw new Error("projection not registered");
    // The caller's context refuses everything: what the projection reaches is
    // the declaring package's, bound at registration.
    const refusing = {
      entityService: {
        getEntity: async (): Promise<never> => {
          throw new Error("caller context must not be used");
        },
        updateEntity: async (): Promise<never> => {
          throw new Error("caller context must not be used");
        },
      },
    };

    const record = await projection.buildRecord({
      entity,
      context: refusing,
      config: {},
    });
    await projection.onPublished({
      entity,
      context: refusing,
      record,
      uri: "at://did:plc:brain/ai.rizom.brain.series/fishing",
      cid: "cid",
    });

    expect(record).toEqual({
      $type: "ai.rizom.brain.series",
      title: "fishing",
    });
    const updated = await harness
      .getEntityService()
      .getEntity({ entityType: "guide", id: "fishing" });
    expect(updated?.metadata["atprotoUri"]).toBe(
      "at://did:plc:brain/ai.rizom.brain.series/fishing",
    );
  });
});
