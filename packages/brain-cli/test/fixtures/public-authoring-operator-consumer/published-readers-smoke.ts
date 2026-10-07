import {
  defineEntity,
  definitionEntitySchema,
  type EntityReader,
  type EntityReads,
} from "@rizom/brain/entities";
import { defineServicePlugin, defineTool, z } from "@rizom/brain/services";
import { createBrainTestHarness } from "@rizom/brain/testing";

const record = defineEntity({
  type: "publication-record",
  purpose: "Publication-filter consumer",
  metadata: z.object({ status: z.string().optional() }),
});
const schema = definitionEntitySchema(record);
const service = defineServicePlugin(
  { id: "publication-reader", config: z.object({}), entities: [record] },
  {
    tools: () => [
      defineTool({
        name: "read",
        description: "Read published or preview records",
        input: z.object({ publishedOnly: z.boolean() }),
        output: z.object({
          draft: z.boolean(),
          typedDraft: z.boolean(),
          ids: z.array(z.string()),
          page: z.array(z.string()),
          count: z.number(),
        }),
        execute: async ({ input: { publishedOnly }, entities }) => {
          const request = {
            entityType: record.type,
            id: "draft",
            publishedOnly,
            visibilityScope: "public" as const,
          };
          if ("getEntityRaw" in entities || "registry" in entities)
            throw new Error("Native authority leaked");
          const draft = await entities.getEntity(request);
          const typedDraft = await entities.getEntity(request, schema);
          const options = { publishedOnly, visibilityScope: "public" as const };
          return {
            draft: draft !== null,
            typedDraft: typedDraft !== null,
            ids: (await entities.search(record, "marker", options)).map(
              (result) => result.entity.id,
            ),
            page: (
              await entities.search(record, "marker", {
                ...options,
                limit: 1,
                offset: 1,
              })
            ).map((result) => result.entity.id),
            count: await entities.count({
              entityType: record.type,
              options: { publishedOnly, filter: { visibilityScope: "public" } },
            }),
          };
        },
      }),
    ],
  },
);

const h = createBrainTestHarness();
try {
  const installed = await h.installPackage(
    service,
    {},
    { name: "@fixture/publication-reader", version: "0.0.0" },
  );
  await h.finalizeRegistration();
  h.addEntities(
    ["active", "draft", "published", "statusless", "hidden"].map((id) => ({
      id,
      entityType: record.type,
      content: "marker",
      metadata:
        id === "statusless"
          ? {}
          : { status: id === "hidden" ? "published" : id },
      visibility: id === "hidden" ? "restricted" : "public",
    })),
  );
  for (const publishedOnly of [true, false]) {
    const result = await installed.tool("read").call({ publishedOnly });
    const expected = publishedOnly
      ? ["active", "published", "statusless"]
      : ["active", "draft", "published", "statusless"];
    if (
      !result.ok ||
      JSON.stringify(result.data) !==
        JSON.stringify({
          draft: !publishedOnly,
          typedDraft: !publishedOnly,
          ids: expected,
          page: expected.slice(1, 2),
          count: expected.length,
        })
    ) {
      throw new Error(`Publication reader mismatch: ${JSON.stringify(result)}`);
    }
  }
} finally {
  await h.reset();
}

export async function dataSourceRead(reader: EntityReads): Promise<unknown> {
  return reader.getEntity(
    { entityType: record.type, id: "published", publishedOnly: true },
    schema,
  );
}

// These fields narrow existing reads; they do not expose the native proxy.
export function unsupportedReaderCalls(reader: EntityReader): void {
  void reader.getEntity({
    entityType: record.type,
    id: "draft",
    // @ts-expect-error Publication selection must be boolean.
    publishedOnly: "true",
  });
  // @ts-expect-error No native scoped-service proxy on the author surface.
  reader.scopeEntityReads({ publishedOnly: true });
}
