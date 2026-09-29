import { expect, test } from "bun:test";
import { drizzle } from "drizzle-orm/libsql";
import { createSilentLogger } from "@brains/test-utils";
import { computeContentHash } from "@brains/utils/hash";
import { z } from "@brains/utils/zod";
import { EntityQueries } from "../src/entity-queries";
import { EntitySerializer } from "../src/entity-serializer";
import { entities } from "../src/schema/entities";
import {
  minimalTestAdapter,
  minimalTestSchema,
  postAdapter,
  postSchema,
} from "./helpers/test-schemas";
import { setupEntityService } from "./helpers/setup-entity-service";

test("10k-entity / 5k-value grouping query and startup gate", async () => {
  const ctx = await setupEntityService(
    [
      { name: "test", schema: minimalTestSchema, adapter: minimalTestAdapter },
      { name: "post", schema: postSchema, adapter: postAdapter },
    ],
    { embeddingsEnabled: false },
  );
  await ctx.entityService.initialize();
  ctx.entityRegistry.registerGrouping({
    key: "clients",
    label: "Clients",
    field: "clients",
    types: ["test", "post"],
  });
  const store = ctx.entityService.getProjectionStore();
  try {
    await store.runDatabaseOperation((db) =>
      db.transaction(async (transaction) => {
        // The fixture shares the runtime owner, with each statement below the
        // fixed SQL argument budget. Never open the migrated file in another engine.
        for (let offset = 0; offset < 10000; offset += 16) {
          const rows = Array.from(
            { length: Math.min(16, 10000 - offset) },
            (_, index) => {
              const i = offset + index;
              const value = `Client-${String(i % 5000).padStart(4, "0")}`;
              const content = `---\nclients: [${value}, ${value}]\n---\n\nBody`;
              return {
                id: `id-${String(i).padStart(5, "0")}`,
                entityType: i % 2 ? "post" : "test",
                content,
                contentHash: computeContentHash(content),
                metadata: {},
                visibility: "public" as const,
                created: i,
                updated: i,
              };
            },
          );
          await transaction.insert(entities).values(rows);
        }
      }),
    );
    const startup = performance.now();
    await ctx.entityService.reprojectRegisteredGroupings();
    const startupMs = performance.now() - startup;
    expect(ctx.entityService.areGroupingsReady()).toBe(true);
    expect(startupMs).toBeLessThan(30000);
    await store.runDatabaseOperation(async (ownedDb) => {
      const client = ownedDb.$client;
      const statements: Array<{ sql: string; params: unknown[] }> = [];
      // A logging facade over the SAME worker client, not another database owner.
      const db = drizzle(client, {
        logger: {
          logQuery: (sql, params): void => {
            statements.push({ sql, params });
          },
        },
      });
      const queries = new EntityQueries({
        db,
        entityRegistry: ctx.entityRegistry,
        logger: createSilentLogger(),
        serializer: new EntitySerializer(
          ctx.entityRegistry,
          createSilentLogger(),
        ),
      });
      const request = { grouping: "clients", entityTypes: ["test", "post"] };
      const started = performance.now();
      const catalog = await queries.queryGroupingCatalog({
        ...request,
        offset: 4900,
      });
      const catalogMs = performance.now() - started;
      expect(catalog.total).toBe(5000);
      expect(catalog.values).toHaveLength(50);
      expect(catalog.values[0]).toEqual({ value: "Client-4900", count: 2 });
      const membersStarted = performance.now();
      const members = await queries.queryGroupingMembers({
        ...request,
        value: "Client-4900",
        limit: 1,
        offset: 1,
      });
      const membersMs = performance.now() - membersStarted;
      expect(members.total).toBe(2);
      expect(members.entities).toHaveLength(1);
      expect(catalogMs).toBeLessThan(1000);
      expect(membersMs).toBeLessThan(1000);
      const plans: string[] = [];
      // Explain the exact executed SQL, not a hand-maintained approximation.
      for (const statement of statements) {
        const plan = await client.execute({
          sql: `EXPLAIN QUERY PLAN ${statement.sql}`,
          args: z
            .array(z.union([z.string(), z.number()]))
            .parse(statement.params),
        });
        plans.push(plan.rows.map((row) => String(row["detail"])).join("; "));
      }
      console.info("Grouping scale gate", {
        startupMs,
        catalogMs,
        membersMs,
        plans,
      });
      expect(plans).toHaveLength(4);
      // Turso names the table-valued JSON operator directly rather than
      // SQLite's generic "VIRTUAL TABLE INDEX" label. All four queries must
      // still perform membership expansion in SQL, not in the controller.
      expect(plans.every((plan) => plan.includes("SCAN json_each AS j"))).toBe(
        true,
      );
    });
  } finally {
    await ctx.entityService.closeAsync();
    await ctx.cleanup();
  }
}, 60000);
