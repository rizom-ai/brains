import { describe, expect, it } from "bun:test";
import { z } from "@brains/utils/zod";
import { baseEntitySchema } from "@brains/entity-service";
import { createPluginHarness } from "../src/test/harness";
import {
  defineServicePlugin,
  defineSubscription,
  instantiatePluginPackageDefinition,
} from "../src";

/**
 * What a subscription handler is allowed to believe about what it read.
 *
 * The reader used to take the shape from the caller: ask for a type and you
 * were handed it, with nothing checking that the records match. A handler
 * could name a field no entity has, compile, and read `undefined` from it at
 * runtime — the failure landing on whichever value it computed from that.
 *
 * A narrowed read now takes the schema that narrows it, which is the same
 * evidence jobs and data sources have always required.
 */
describe("reading entities from a subscription", () => {
  const harness = createPluginHarness();

  const noteSchema = baseEntitySchema.extend({
    metadata: z.object({ words: z.number() }),
  });

  it("parses what it read through the schema it was given", async () => {
    let seen: number | undefined;

    const [plugin] = instantiatePluginPackageDefinition(
      defineServicePlugin(
        { id: "counter", config: z.object({}) },
        {
          subscriptions: () => [
            defineSubscription({
              topic: "counter:read",
              payload: z.object({ id: z.string() }),
              handle: async ({ payload, entities }) => {
                const note = await entities.getEntity(
                  { entityType: "note", id: payload.id },
                  noteSchema,
                );
                seen = note?.metadata.words;
                return { words: seen };
              },
            }),
          ],
        },
      ),
      {},
      { name: "@fixture/counter", version: "0.1.0" },
    );
    if (!plugin) throw new Error("Service plugin was not created");
    await harness.installPlugin(plugin);

    harness.getMockShell().addEntities([
      {
        id: "note-1",
        entityType: "note",
        content: "# Note",
        metadata: { words: 42 },
        created: "2026-07-01T00:00:00.000Z",
        updated: "2026-07-01T00:00:00.000Z",
        contentHash: "",
        visibility: "public",
      },
    ]);

    await harness.sendMessage("counter:read", { id: "note-1" });

    expect(seen).toBe(42);

    await harness.reset();
  });

  it("hands back the base entity when no schema narrows it", async () => {
    let type: string | undefined;

    const [plugin] = instantiatePluginPackageDefinition(
      defineServicePlugin(
        { id: "plain", config: z.object({}) },
        {
          subscriptions: () => [
            defineSubscription({
              topic: "plain:read",
              payload: z.object({ id: z.string() }),
              handle: async ({ payload, entities }) => {
                const note = await entities.getEntity({
                  entityType: "note",
                  id: payload.id,
                });
                type = note?.entityType;
                return { type };
              },
            }),
          ],
        },
      ),
      {},
      { name: "@fixture/plain", version: "0.1.0" },
    );
    if (!plugin) throw new Error("Service plugin was not created");
    await harness.installPlugin(plugin);

    harness.getMockShell().addEntities([
      {
        id: "note-2",
        entityType: "note",
        content: "# Note",
        metadata: {},
        created: "2026-07-01T00:00:00.000Z",
        updated: "2026-07-01T00:00:00.000Z",
        contentHash: "",
        visibility: "public",
      },
    ]);

    await harness.sendMessage("plain:read", { id: "note-2" });

    expect(type).toBe("note");

    await harness.reset();
  });
});
