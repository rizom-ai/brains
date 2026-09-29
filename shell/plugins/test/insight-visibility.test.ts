import { describe, expect, it } from "bun:test";
import { z } from "@brains/utils/zod";
import {
  defineEntity,
  defineEntityPackage,
  defineServicePlugin,
  instantiatePluginPackageDefinition,
  type EntityInsightDeclaration,
} from "../src";
import { createPluginHarness } from "../src/test/harness";

const scopes = ["public", "shared", "restricted"] as const;
const record = defineEntity({
  type: "insight-record",
  purpose: "Insight visibility regression",
  metadata: z.object({ title: z.string() }),
});

describe("registered insight caller visibility", () => {
  for (const kind of ["service", "entity"] as const) {
    for (const [capIndex, cap] of scopes.entries()) {
      for (const [requestedIndex, requested] of scopes.entries()) {
        it(`${kind}: ${cap} caps ${requested} without widening narrower reads`, async () => {
          const insights: EntityInsightDeclaration = {
            review: async ({ entities, visibilityScope }) => ({
              scope: visibilityScope,
              typed: await Promise.all(
                scopes.map((id) => entities.get(record, id)),
              ),
              dynamic: await Promise.all(
                scopes.map((id) =>
                  entities.getEntity({
                    entityType: record.type,
                    id,
                    visibilityScope: requested,
                  }),
                ),
              ),
              list: await entities.listEntities({
                entityType: record.type,
                options: { filter: { visibilityScope: requested } },
              }),
              count: await entities.count({
                entityType: record.type,
                options: { filter: { visibilityScope: requested } },
              }),
              counts: await entities.getEntityCounts(requested),
              search: await entities.search({
                query: "marker",
                options: { types: [record.type], visibilityScope: requested },
              }),
            }),
          };
          const definition =
            kind === "service"
              ? defineServicePlugin(
                  {
                    id: "insight-service",
                    config: z.object({}),
                    entities: [record],
                  },
                  { insights: () => insights },
                )
              : defineEntityPackage({
                  id: "insight-entity",
                  entities: [
                    defineEntity({
                      type: record.type,
                      purpose: record.purpose,
                      metadata: record.metadata,
                      insights,
                    }),
                  ],
                });
          const harness = createPluginHarness();
          try {
            await harness.installPlugins(
              instantiatePluginPackageDefinition(
                definition,
                {},
                {
                  name: `@fixture/insight-${kind}`,
                  version: "0.0.0",
                },
              ),
            );
            harness.addEntities(
              scopes.map((visibility) => ({
                id: visibility,
                entityType: record.type,
                content: `${visibility} marker`,
                metadata: { title: visibility },
                visibility,
              })),
            );
            const shell = harness.getMockShell();
            const result = await shell
              .getInsightsRegistry()
              .get("review", shell.getEntityService(), cap);
            const allowedIndex = Math.min(capIndex, requestedIndex);
            expect(result["scope"]).toBe(cap);
            expect(result["typed"]).toEqual(
              scopes.map((id, index) =>
                index <= capIndex ? expect.objectContaining({ id }) : null,
              ),
            );
            expect(result["dynamic"]).toEqual(
              scopes.map((id, index) =>
                index <= allowedIndex ? expect.objectContaining({ id }) : null,
              ),
            );
            expect(result["list"]).toHaveLength(allowedIndex + 1);
            expect(result["count"]).toBe(allowedIndex + 1);
            expect(result["counts"]).toContainEqual({
              entityType: record.type,
              count: allowedIndex + 1,
            });
            expect(result["search"]).toHaveLength(allowedIndex + 1);
          } finally {
            await harness.reset();
          }
        });
      }
    }
  }
});
