import { describe, expect, it } from "bun:test";
import { z } from "@brains/utils/zod";
import { createSilentLogger } from "@brains/test-utils";
import { createPluginHarness } from "../src/test/harness";
import type {
  CreateExecutionContext,
  CreateInput,
  CreateInterceptionResult,
} from "../src";
import {
  defineEntity,
  defineEntityPackage,
  instantiatePluginPackageDefinition,
} from "../src";

/**
 * A create route may point another entity at what it created — or at what it
 * found already there.
 *
 * A generation could already: it hands back `linkInto` and the runtime —
 * entitled to both sides — writes the target's field. A route that creates
 * immediately could not, so a cover that arrived as bytes rather than as a
 * prompt had no sanctioned way to become the target's cover. Same write, same
 * owner of the write; the only difference was which slot asked for it.
 *
 * And one write path means one rule: a type that never declared a cover
 * refuses one here exactly as it does through `system_update`.
 */

const executionContext: CreateExecutionContext = {
  interfaceType: "test",
  actor: { kind: "user", userId: "tester" },
};

const poster = defineEntity({
  type: "poster",
  purpose: "A picture handed over whole.",
  metadata: z.object({ title: z.string() }),
  create: {
    fromContent: {
      resolve: async ({ input }) => {
        const linkInto =
          input.targetEntityType && input.targetEntityId
            ? {
                entityType: input.targetEntityType,
                entityId: input.targetEntityId,
                field: "coverImageId",
              }
            : undefined;
        // "reuse" stands in for a route recognising a picture it already
        // stored — by its source URL, say — and declining to store it twice.
        if (input.title === "reuse") {
          return {
            existing: { id: "poster-1" },
            ...(linkInto ? { linkInto } : {}),
          };
        }
        return {
          create: {
            id: "poster-1",
            content: input.content ?? "",
            metadata: { title: input.title ?? "Poster" },
          },
          ...(linkInto ? { linkInto } : {}),
        };
      },
    },
  },
});

const notice = defineEntity({
  type: "notice",
  purpose: "Something a poster can be the cover of.",
  metadata: z.object({ title: z.string() }),
  coverImage: true,
});

const bulletin = defineEntity({
  type: "bulletin",
  purpose: "Plain text that never asked for a cover.",
  metadata: z.object({ title: z.string() }),
});

const seeded = (
  entityType: string,
  id: string,
): Parameters<
  ReturnType<typeof createPluginHarness>["addEntities"]
>[0][number] => ({
  id,
  entityType,
  content: `---\ntitle: ${id}\n---\nBody.`,
  contentHash: `${id}-hash`,
  metadata: { title: id },
});

async function installed(): Promise<{
  harness: ReturnType<typeof createPluginHarness>;
  create: (input: CreateInput) => Promise<CreateInterceptionResult>;
}> {
  const harness = createPluginHarness({
    logger: createSilentLogger("entity-create-link"),
  });
  const plugins = instantiatePluginPackageDefinition(
    defineEntityPackage({
      id: "notices",
      entities: [poster, notice, bulletin],
    }),
    {},
    { name: "@fixture/notices", version: "0.1.0" },
  );
  for (const plugin of plugins) await harness.installPlugin(plugin);
  const interceptor = harness
    .getEntityRegistry()
    .getCreateInterceptor("poster");
  if (!interceptor) throw new Error("poster interceptor not registered");
  return {
    harness,
    create: (input) => interceptor(input, executionContext),
  };
}

describe("a create route that links into a target", () => {
  it("has the runtime write the target's field", async () => {
    const { harness, create } = await installed();
    harness.addEntities([seeded("notice", "notice-1")]);

    const result = await create({
      entityType: "poster",
      content: "a poster",
      title: "Open Day Poster",
      targetEntityType: "notice",
      targetEntityId: "notice-1",
    });

    expect(result).toMatchObject({
      kind: "handled",
      result: { success: true, data: { status: "created" } },
    });
    const target = await harness
      .getEntityService()
      .getEntity({ entityType: "notice", id: "notice-1" });
    expect(target?.content).toContain("coverImageId: poster-1");

    await harness.reset();
  });

  it("refuses rather than creating an orphan when the target is gone", async () => {
    const { harness, create } = await installed();

    const result = await create({
      entityType: "poster",
      content: "a poster",
      targetEntityType: "notice",
      targetEntityId: "never-made",
    });

    // Nothing written: a poster that was to be somebody's cover, with nobody
    // to be the cover of, is not what was asked for.
    expect(result).toMatchObject({
      kind: "handled",
      result: { success: false },
    });
    const orphan = await harness
      .getEntityService()
      .getEntity({ entityType: "poster", id: "poster-1" });
    expect(orphan).toBeNull();

    await harness.reset();
  });

  it("refuses a cover on a type that never declared one", async () => {
    const { harness, create } = await installed();
    harness.addEntities([seeded("bulletin", "bulletin-1")]);

    const result = await create({
      entityType: "poster",
      content: "a poster",
      targetEntityType: "bulletin",
      targetEntityId: "bulletin-1",
    });

    // The same refusal `system_update` gives: the declaration is one thing,
    // and every door that writes a cover reads it.
    expect(result).toMatchObject({
      kind: "handled",
      result: {
        success: false,
        error: "Entity type 'bulletin' doesn't support cover images",
      },
    });
    const orphan = await harness
      .getEntityService()
      .getEntity({ entityType: "poster", id: "poster-1" });
    expect(orphan).toBeNull();
    const target = await harness
      .getEntityService()
      .getEntity({ entityType: "bulletin", id: "bulletin-1" });
    if (!target) throw new Error("The target was not found");
    expect(target.content).not.toContain("coverImageId");

    await harness.reset();
  });
});

describe("a create route that finds what it was asked to create", () => {
  it("links the existing entity and writes nothing else", async () => {
    const { harness, create } = await installed();
    harness.addEntities([
      seeded("notice", "notice-1"),
      { ...seeded("poster", "poster-1"), content: "the original bytes" },
    ]);

    const result = await create({
      entityType: "poster",
      content: "the same bytes again",
      title: "reuse",
      targetEntityType: "notice",
      targetEntityId: "notice-1",
    });

    expect(result).toMatchObject({
      kind: "handled",
      result: {
        success: true,
        data: { status: "existing", entityId: "poster-1" },
      },
    });
    const kept = await harness
      .getEntityService()
      .getEntity({ entityType: "poster", id: "poster-1" });
    expect(kept?.content).toBe("the original bytes");
    const target = await harness
      .getEntityService()
      .getEntity({ entityType: "notice", id: "notice-1" });
    expect(target?.content).toContain("coverImageId: poster-1");

    await harness.reset();
  });

  it("refuses when the entity it claims to have found is not there", async () => {
    const { harness, create } = await installed();
    harness.addEntities([seeded("notice", "notice-1")]);

    const result = await create({
      entityType: "poster",
      content: "bytes",
      title: "reuse",
      targetEntityType: "notice",
      targetEntityId: "notice-1",
    });

    // The runtime reports what happened rather than what the route claimed,
    // and here nothing did.
    expect(result).toMatchObject({
      kind: "handled",
      result: { success: false },
    });
    const target = await harness
      .getEntityService()
      .getEntity({ entityType: "notice", id: "notice-1" });
    if (!target) throw new Error("The target was not found");
    expect(target.content).not.toContain("coverImageId");

    await harness.reset();
  });
});
