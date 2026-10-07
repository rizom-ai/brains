import { describe, expect, it } from "bun:test";
import { z } from "@brains/utils/zod";
import {
  defineEntity,
  defineServicePlugin,
  defineTool,
  instantiatePluginPackageDefinition,
} from "../src";
import { createPluginHarness } from "../src/test/harness";

for (const phase of ["before instantiation", "after installation"]) {
  describe(`service declaration ownership ${phase}`, () => {
    for (const mutation of [
      "replace the entities array",
      "change an entity type",
    ]) {
      it(`does not change installed ownership when authors ${mutation}`, async () => {
        const own = defineEntity({
          type: "owned-record",
          purpose: "Owned record",
          metadata: z.object({}),
        });
        const foreign = defineEntity({
          type: "foreign-record",
          purpose: "Another installed owner's record",
          metadata: z.object({}),
        });
        // Structural declarations and their source collections remain caller-owned.
        const mutableOwn = { ...own, type: "owned-record" };
        const declarations: Array<typeof mutableOwn | typeof foreign> = [
          mutableOwn,
        ];
        const owner = defineServicePlugin({
          id: "owner",
          config: z.object({}),
          entities: [foreign],
        });
        const writer = defineServicePlugin(
          { id: "writer", config: z.object({}), entities: declarations },
          {
            tools: () => [
              defineTool({
                name: "write",
                description: "Write a selected type",
                input: z.object({ foreign: z.boolean() }),
                output: z.object({ id: z.string() }),
                execute: ({ input, entities }) =>
                  entities.create(input.foreign ? foreign : own, {
                    id: "one",
                    content: "Body",
                    metadata: {},
                  }),
              }),
            ],
          },
        );
        const mutate = (): void => {
          if (mutation === "replace the entities array")
            declarations.splice(0, 1, foreign);
          else mutableOwn.type = foreign.type;
        };
        if (phase === "before instantiation") mutate();
        const writerPlugins = instantiatePluginPackageDefinition(
          writer,
          {},
          {
            name: "@fixture/writer",
            version: "0.0.0",
          },
        );
        expect(writerPlugins.map((plugin) => plugin.id)).toEqual([
          "@fixture/writer:writer",
          "@fixture/writer:owned-record",
        ]);
        const h = createPluginHarness();
        try {
          for (const plugin of instantiatePluginPackageDefinition(
            owner,
            {},
            {
              name: "@fixture/owner",
              version: "0.0.0",
            },
          ))
            await h.installPlugin(plugin);
          const installed = await h.installPlugins(writerPlugins);
          await h.finalizeRegistration();
          const tool = installed.flatMap((item) => item.capabilities.tools)[0];
          if (!tool) throw new Error("Writer tool was not installed");
          const call = (foreign: boolean): ReturnType<typeof h.callTool> =>
            h.callTool(
              tool,
              { foreign },
              {
                interfaceType: "test",
                actor: { kind: "service", serviceId: "test" },
                userPermissionLevel: "admin",
              },
            );
          expect(await call(true)).toMatchObject({
            success: false,
            code: "handler_failed",
          });
          if (phase === "after installation") mutate();
          expect(await call(true)).toMatchObject({
            success: false,
            code: "handler_failed",
          });
          expect(
            await h
              .getEntityService()
              .getEntity({ entityType: foreign.type, id: "one" }),
          ).toBeNull();
          expect(await call(false)).toMatchObject({
            success: true,
            data: { id: "one" },
          });
          expect(
            await h
              .getEntityService()
              .getEntity({ entityType: own.type, id: "one" }),
          ).toMatchObject({ content: "Body" });
        } finally {
          await h.reset();
        }
      });
    }
  });
}
