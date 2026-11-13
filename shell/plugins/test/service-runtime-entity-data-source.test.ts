import { describe, expect, it } from "bun:test";
import { z } from "@brains/utils/zod";
import { createMockShell, type MockShell } from "../src/test/mock-shell";
import {
  defineDataSource,
  defineEntity,
  defineServicePlugin,
  instantiatePluginPackageDefinition,
  serviceRuntime,
  withTools,
  type BaseEntity,
  type DataSource,
} from "../src";

/**
 * A first-party service converted from an entity plugin class serves the
 * entity data source its class served, under the id the class named it
 * by, with the runtime's own list, filter, sort, limit, lookup and
 * navigation, reading at the build's scope: as an entity package serves
 * one, under the service's id rather than its type's.
 */

const memoMetadata = z.object({
  title: z.string(),
  slug: z.string(),
  status: z.enum(["draft", "done"]),
});
const memo = defineEntity({
  type: "memo",
  purpose: "A memo.",
  metadata: memoMetadata,
});

const memos = defineDataSource({
  id: "entities",
  name: "Memos",
  description: "Memos for the memo pages",
  entity: memo,
  defaultSort: [{ field: "title", direction: "asc" }],
  defaultLimit: 2,
  lookupField: "slug",
  enableNavigation: true,
  filter: (query) => {
    const status = memoMetadata.shape.status.safeParse(query["status"]);
    return status.success ? { metadata: { status: status.data } } : undefined;
  },
  transform: (entity) => ({ id: entity.id, title: entity.metadata.title }),
  list: (items, pagination) => ({ memos: items, pagination }),
  detail: ({ item, navigation }) => ({
    memo: item,
    prev: navigation?.prev ?? null,
    next: navigation?.next ?? null,
  }),
});

function stored(id: string, title: string, status: string): BaseEntity {
  return {
    id,
    entityType: "memo",
    content: `---\ntitle: ${title}\nslug: ${id}\nstatus: ${status}\n---\nBody.`,
    contentHash: id,
    visibility: "public",
    metadata: { title, slug: id, status },
    created: "2026-01-01T00:00:00.000Z",
    updated: "2026-01-01T00:00:00.000Z",
  };
}

async function served(): Promise<{ shell: MockShell; source: DataSource }> {
  const shell = createMockShell();
  const plugins = instantiatePluginPackageDefinition(
    withTools(
      defineServicePlugin({
        id: "memo-service",
        config: z.object({}),
        entities: [memo],
        setup: (context): Record<never, never> => {
          serviceRuntime(context).dataSource(memos);
          return {};
        },
      }),
      () => [],
    ),
    {},
    { name: "@brains/memos", version: "0.1.0" },
    { pluginId: "memos", ownedTypePluginId: "memo-entity" },
  );
  for (const plugin of plugins) await plugin.register(shell);
  shell.addEntities([
    stored("alpha", "Alpha", "done"),
    stored("beta", "Beta", "draft"),
    stored("gamma", "Gamma", "done"),
  ]);
  const source = shell.getDataSourceRegistry().get("memos:entities");
  if (!source) throw new Error("No memo data source");
  return { shell, source };
}

const item = z.object({ id: z.string(), title: z.string() });

describe("a first-party service serving an entity data source", () => {
  it("lists a page, sorted, limited and filtered as the source declares", async () => {
    const { shell, source } = await served();
    const listed = z.object({
      memos: z.array(item),
      pagination: z.unknown(),
    });
    const context = { entityService: shell.getEntityService() };
    expect(
      (await source.fetch?.({ entityType: "memo" }, listed, context))?.memos,
    ).toEqual([
      { id: "alpha", title: "Alpha" },
      { id: "beta", title: "Beta" },
    ]);
    expect(
      (
        await source.fetch?.(
          { entityType: "memo", query: { status: "done" } },
          listed,
          context,
        )
      )?.memos,
    ).toEqual([
      { id: "alpha", title: "Alpha" },
      { id: "gamma", title: "Gamma" },
    ]);
  });

  it("finds one by its lookup field, with its neighbors", async () => {
    const { shell, source } = await served();
    const detail = z.object({
      memo: item,
      prev: item.nullable(),
      next: item.nullable(),
    });
    expect(
      await source.fetch?.(
        { entityType: "memo", query: { id: "beta" } },
        detail,
        { entityService: shell.getEntityService() },
      ),
    ).toEqual({
      memo: { id: "beta", title: "Beta" },
      prev: { id: "alpha", title: "Alpha" },
      next: { id: "gamma", title: "Gamma" },
    });
  });

  it("refuses an entity data source over a type the package does not declare", async () => {
    const other = defineEntity({
      type: "other",
      purpose: "Another package's type.",
      metadata: memoMetadata,
    });
    const shell = createMockShell();
    const plugins = instantiatePluginPackageDefinition(
      defineServicePlugin({
        id: "memo-service",
        config: z.object({}),
        entities: [memo],
        setup: (context): Record<never, never> => {
          serviceRuntime(context).dataSource(
            defineDataSource({
              id: "others",
              name: "Others",
              description: "Another package's records",
              entity: other,
              defaultSort: [{ field: "title", direction: "asc" }],
              transform: (entity) => entity.id,
              list: (items) => ({ items }),
            }),
          );
          return {};
        },
      }),
      {},
      { name: "@brains/memos", version: "0.1.0" },
      { pluginId: "memos", ownedTypePluginId: "memo-entity" },
    );
    let refusal: unknown;
    for (const plugin of plugins)
      await plugin.register(shell).catch((error: unknown) => {
        refusal = error;
      });
    expect(String(refusal)).toContain(
      'Data source "others" reads "other", which the package does not declare',
    );
  });
});
