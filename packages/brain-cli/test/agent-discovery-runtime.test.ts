import { afterEach, describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import {
  agentDiscoveryPackage,
  agentFromMarkdown,
  derivedSkillPackage,
} from "@brains/agent-discovery";
import {
  scopeEntityReads,
  type EntityTypeConfig,
} from "@brains/entity-service";
import { readMarkdownFrontmatter } from "@brains/utils/markdown-frontmatter";
import { z } from "@brains/utils/zod";
import {
  declaredEntityStore,
  type DeclaredEntityStore,
} from "./helpers/declared-entity-store";

/**
 * The declared agent and skill types on the brain's own entity store, byte
 * for byte as main's adapters stored them (the bytes in
 * fixtures/agent-discovery-main-bytes.json were captured from the
 * agent-discovery and skill classes). Every row is stored as main stored
 * it and keeps main's metadata. An agent reads as its stored document,
 * since its header holds what its metadata does not and the directory's
 * readers parse it from content; a skill reads as its body, its fields as
 * metadata. A row main stored reads, lists and searches before the boot
 * pass that re-derives declared metadata reaches it and after, and the
 * pass writes nothing to it.
 */

const storedSchema = z.object({
  content: z.string(),
  metadata: z.string(),
  visibility: z.string(),
});
const readSchema = z.object({
  content: z.string(),
  metadata: z.record(z.string(), z.unknown()),
  visibility: z.string(),
});
const rowSchema = z.object({
  id: z.string(),
  stored: storedSchema,
  read: readSchema,
  exported: z.string(),
});
const importedSchema = rowSchema.extend({ file: z.string() });
const writtenSchema = rowSchema.extend({ written: z.string() });
const main = z
  .object({
    agentCurrent: importedSchema,
    agentOldBody: importedSchema,
    agentLegacy: importedSchema,
    agentCreated: writtenSchema,
    agentApproved: writtenSchema,
    skillImported: importedSchema,
    skillCreated: writtenSchema,
  })
  .parse(
    JSON.parse(
      await readFile(
        join(import.meta.dir, "fixtures", "agent-discovery-main-bytes.json"),
        "utf8",
      ),
    ),
  );

/** What main's AgentDataSource answered, over five agents at two scopes. */
const mainDirectory = z
  .object({
    files: z.record(
      z.string(),
      z.object({
        markdown: z.string(),
        visibility: z.enum(["public", "restricted"]),
      }),
    ),
  })
  .loose()
  .parse(
    JSON.parse(
      await readFile(
        join(import.meta.dir, "fixtures", "agent-datasource-main.json"),
        "utf8",
      ),
    ),
  );

/** Created and updated times, which differ with when a row was written. */
function untimed(value: unknown): unknown {
  return JSON.parse(
    JSON.stringify(value, (key, field: unknown) =>
      key === "created" || key === "updated" ? "<ts>" : field,
    ),
  );
}

const stores: DeclaredEntityStore[] = [];
afterEach(async () => {
  for (const store of stores.splice(0)) await store.close();
});

async function agentStore(): Promise<DeclaredEntityStore> {
  const opened = await declaredEntityStore(
    agentDiscoveryPackage,
    "@brains/agent-discovery",
    { pluginId: "agent-discovery", ownedTypePluginId: "agent-entity" },
    {
      classification: "system",
      projectionSourceRole: "supporting",
      retiredFields: [
        "cardObservedAt",
        "cardLastCheckedAt",
        "a2aEndpoint",
        "did",
        "anchorDid",
      ],
    } satisfies EntityTypeConfig,
  );
  stores.push(opened);
  return opened;
}

async function skillStore(): Promise<DeclaredEntityStore> {
  const opened = await declaredEntityStore(
    derivedSkillPackage,
    "@brains/agent-discovery",
    { pluginId: "skill", ownedTypePluginId: "skill-entity" },
    {
      classification: "system",
      projectionSource: false,
      projectionSourceRole: "excluded",
    } satisfies EntityTypeConfig,
  );
  stores.push(opened);
  return opened;
}

const EVERY = { visibilityScope: "restricted" } as const;

interface RowView {
  stored: string | undefined;
  metadata: unknown;
  read: string | undefined;
  readMetadata: unknown;
}

async function rowOf(
  opened: DeclaredEntityStore,
  entityType: string,
  id: string,
): Promise<RowView> {
  const stored = await opened.stored(entityType, id);
  const read = await opened.service.getEntity({ entityType, id, ...EVERY });
  return {
    stored: stored?.content,
    metadata: JSON.parse(stored?.metadata ?? "null"),
    read: read?.content,
    readMetadata: read?.metadata,
  };
}

/** Main's row, read as the declared type reads it. */
function asMain(
  row: {
    stored: z.output<typeof storedSchema>;
    read: z.output<typeof readSchema>;
  },
  reads: "body" | "document",
): RowView {
  return {
    stored: row.stored.content,
    metadata: JSON.parse(row.stored.metadata),
    read:
      reads === "body"
        ? readMarkdownFrontmatter(row.read.content).content.trim()
        : row.read.content,
    readMetadata: row.read.metadata,
  };
}

async function imported(
  opened: DeclaredEntityStore,
  entityType: string,
  id: string,
  markdown: string,
): Promise<RowView> {
  await opened.service.createEntityFromMarkdown({
    input: { entityType, id, markdown },
  });
  return rowOf(opened, entityType, id);
}

describe("the declared agent and skill types on the entity store", () => {
  test("store imported agents as the agent adapter wrote them", async () => {
    const opened = await agentStore();
    for (const row of [main.agentCurrent, main.agentOldBody, main.agentLegacy])
      expect(await imported(opened, "agent", row.id, row.file)).toEqual(
        asMain(row, "document"),
      );
  });

  test("store a card agent's create and its approval as main stored them", async () => {
    const opened = await agentStore();
    const created = main.agentCreated.read;
    await opened.service.createEntity({
      entity: {
        id: main.agentCreated.id,
        entityType: "agent",
        content: main.agentCreated.written,
        metadata: created.metadata,
        visibility: "public",
      },
    });
    expect(await rowOf(opened, "agent", main.agentCreated.id)).toEqual(
      asMain(main.agentCreated, "document"),
    );
    const existing = await opened.service.getEntity({
      entityType: "agent",
      id: main.agentCreated.id,
    });
    if (!existing) throw new Error("No agent");
    await opened.service.updateEntity({
      entity: {
        ...existing,
        content: main.agentApproved.written,
        metadata: main.agentApproved.read.metadata,
      },
    });
    expect(await rowOf(opened, "agent", main.agentCreated.id)).toEqual(
      asMain(main.agentApproved, "document"),
    );
  });

  test("store skills as the skill adapter wrote them", async () => {
    const opened = await skillStore();
    expect(
      await imported(
        opened,
        "skill",
        main.skillImported.id,
        main.skillImported.file,
      ),
    ).toEqual(asMain(main.skillImported, "body"));
    await opened.service.createEntity({
      entity: {
        id: main.skillCreated.id,
        entityType: "skill",
        content: main.skillCreated.written,
        metadata: main.skillCreated.read.metadata,
        visibility: "public",
      },
    });
    expect(await rowOf(opened, "skill", main.skillCreated.id)).toEqual(
      asMain(main.skillCreated, "body"),
    );
  });

  test("read, list and search rows main stored, before the boot pass and after", async () => {
    for (const [open, entityType, row, reads, word] of [
      [agentStore, "agent", main.agentCurrent, "document", "interview"],
      [skillStore, "skill", main.skillImported, "body", "Knowledge"],
    ] as const) {
      const opened = await open();
      await opened.service.createEntityFromMarkdown({
        input: { entityType, id: row.id, markdown: row.file },
      });
      // The row exactly as main stored it, dated as an older row is.
      await opened.rewrite(
        entityType,
        row.id,
        row.stored.content,
        row.stored.metadata,
      );
      await opened.setCreated(entityType, row.id, 1_700_000_000_000);
      const before = await opened.stored(entityType, row.id);
      const updatedOf = async (): Promise<string | undefined> =>
        (await opened.service.getEntity({ entityType, id: row.id, ...EVERY }))
          ?.updated;
      const updatedBefore = await updatedOf();
      const exportsBefore = await opened.service.listPendingEntityExports();

      const expectReadable = async (): Promise<void> => {
        expect(await rowOf(opened, entityType, row.id)).toEqual(
          asMain(row, reads),
        );
        const listed = await opened.service.listEntities({
          entityType,
          options: { filter: EVERY },
        });
        expect(listed.map(({ id, metadata }) => [id, metadata])).toEqual([
          [row.id, row.read.metadata],
        ]);
        const found = await opened.service.search({
          query: word,
          options: { types: [entityType], ...EVERY },
        });
        expect(found.map(({ entity }) => entity.id)).toEqual([row.id]);
      };

      await expectReadable();
      expect(await opened.service.reconcileDeclaredMetadata()).toEqual({
        reconciled: 0,
      });
      await expectReadable();
      // The pass wrote nothing: content, hash and update time are main's.
      expect(await opened.stored(entityType, row.id)).toEqual(before);
      expect(await updatedOf()).toBe(updatedBefore);
      expect(await opened.service.listPendingEntityExports()).toEqual(
        exportsBefore,
      );
    }
  });

  test("serve agent-discovery:entities as main's data source served it, at the build's scope", async () => {
    const opened = await agentStore();
    for (const [id, { markdown, visibility }] of Object.entries(
      mainDirectory.files,
    )) {
      await opened.service.createEntity({
        entity: {
          id,
          entityType: "agent",
          content: markdown,
          metadata: agentFromMarkdown(markdown).metadata,
          visibility,
        },
      });
    }
    const queries: Record<string, unknown> = {
      listPublic: { entityType: "agent" },
      listApproved: { entityType: "agent", query: { status: "approved" } },
      listPaged: {
        entityType: "agent",
        query: { page: 2, pageSize: 2, baseUrl: "/agents" },
      },
      detailMiddle: { entityType: "agent", query: { id: "bravo-example" } },
      detailFirst: { entityType: "agent", query: { id: "delta-example" } },
      detailLast: { entityType: "agent", query: { id: "alpha-example" } },
    };
    const expected: Record<string, unknown> = JSON.parse(
      await readFile(
        join(import.meta.dir, "fixtures", "agent-datasource-main.json"),
        "utf8",
      ),
    );
    for (const scope of ["public", "restricted"] as const) {
      const context = {
        entityService: scopeEntityReads(opened.service, {
          visibilityScope: scope,
        }),
      };
      for (const [name, query] of Object.entries(queries)) {
        const answered = await opened
          .fetchData("agent-discovery:entities", query, z.unknown(), context)
          .then(
            (result) => result,
            (error: unknown) => ({
              error: error instanceof Error ? error.message : String(error),
            }),
          );
        expect([scope, name, untimed(answered)]).toEqual([
          scope,
          name,
          untimed(expected[`${scope}:${name}`]),
        ]);
      }
    }
    // A production build reads public records, published only.
    const production = {
      entityService: scopeEntityReads(opened.service, {
        visibilityScope: "public",
      }),
      publishedOnly: true,
    };
    for (const [name, query] of Object.entries(queries)) {
      const answered = await opened
        .fetchData("agent-discovery:entities", query, z.unknown(), production)
        .then(
          (result) => result,
          (error: unknown) => ({
            error: error instanceof Error ? error.message : String(error),
          }),
        );
      expect(["production", name, untimed(answered)]).toEqual([
        "production",
        name,
        untimed(expected[`production:${name}`]),
      ]);
    }
  });
});
