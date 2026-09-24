import { expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { fileURLToPath } from "node:url";
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { createSilentLogger } from "@brains/test-utils";
import { computeContentHash } from "@brains/utils/hash";
import { z } from "@brains/utils/zod";
import { EntityQueries } from "../src/entity-queries";
import { EntitySerializer } from "../src/entity-serializer";
import { createEmbeddingDatabase } from "../src/db/embedding-db";
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
  const fixture = new Database(fileURLToPath(ctx.dbConfig.url));
  const client = createClient({ url: ctx.dbConfig.url });
  const embedding = createEmbeddingDatabase(ctx.embeddingDbConfig);
  try {
    const insert = fixture.prepare(
      "INSERT INTO entities (id, entityType, content, contentHash, metadata, visibility, created, updated) VALUES (?, ?, ?, ?, '{}', 'public', ?, ?)",
    );
    fixture.transaction(() => {
      for (let i = 0; i < 10000; i++) {
        const value = `Client-${String(i % 5000).padStart(4, "0")}`;
        const content = `---\nclients: [${value}, ${value}]\n---\n\nBody`;
        insert.run(
          `id-${String(i).padStart(5, "0")}`,
          i % 2 ? "post" : "test",
          content,
          computeContentHash(content),
          i,
          i,
        );
      }
    })();
    const startup = performance.now();
    await ctx.entityService.reprojectRegisteredGroupings();
    const startupMs = performance.now() - startup;
    expect(ctx.entityService.areGroupingsReady()).toBe(true);
    expect(startupMs).toBeLessThan(30000);
    const statements: Array<{ sql: string; params: unknown[] }> = [];
    const db = drizzle(client, {
      logger: {
        logQuery: (sql, params): void => {
          statements.push({ sql, params });
        },
      },
    });
    const queries = new EntityQueries({
      db,
      embeddingDb: embedding.db,
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
    expect(plans).toHaveLength(4);
    expect(plans.every((plan) => plan.includes("VIRTUAL TABLE INDEX"))).toBe(
      true,
    );
    console.info("Grouping scale gate", {
      startupMs,
      catalogMs,
      membersMs,
      plans,
    });
  } finally {
    fixture.close();
    client.close();
    embedding.client.close();
    ctx.entityService.close();
    await ctx.cleanup();
  }
}, 60000);
