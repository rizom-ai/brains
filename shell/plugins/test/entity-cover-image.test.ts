import { describe, expect, it } from "bun:test";
import { z } from "@brains/utils/zod";
import type { BaseEntity, EntityAdapter } from "@brains/entity-service";
import { createPluginHarness } from "../src/test/harness";
import {
  defineEntity,
  defineEntityPackage,
  instantiatePluginPackageDefinition,
} from "../src";

/**
 * A declared type can say it carries a cover image.
 *
 * `system_update` refuses `coverImageId` on any type whose adapter does not
 * say it supports one, and until now nothing a declaration said reached that
 * flag. Five types declared it as classes — post, deck, project, series,
 * social-post — and lost it on conversion, so no converted type could be given
 * a cover through the runtime at all.
 */

async function adapterFor(
  definition: ReturnType<typeof defineEntity>,
): Promise<EntityAdapter<BaseEntity>> {
  const [plugin] = instantiatePluginPackageDefinition(
    defineEntityPackage({ id: "covers", entities: [definition] }),
    {},
    { name: "@fixture/covers", version: "0.1.0" },
  );
  if (!plugin) throw new Error("Entity plugin was not created");
  const harness = createPluginHarness();
  await harness.installPlugin(plugin);
  return harness.getEntityRegistry().getAdapter(definition.type);
}

describe("a declared entity's cover image", () => {
  it("reaches the adapter the update tool consults", async () => {
    const adapter = await adapterFor(
      defineEntity({
        type: "flyer",
        purpose: "A one-page announcement.",
        metadata: z.object({ coverImageId: z.string().optional() }),
        coverImage: true,
      }),
    );

    expect(adapter.supportsCoverImage).toBe(true);
  });

  it("is absent for a type that did not declare one", async () => {
    const adapter = await adapterFor(
      defineEntity({
        type: "ledger",
        purpose: "A running tally.",
        metadata: z.object({ total: z.number() }),
      }),
    );

    // Not `false`: the flag is a declaration, and a type that never made it
    // reads the same as one written before the flag existed.
    expect(adapter.supportsCoverImage).toBeUndefined();
  });
});
