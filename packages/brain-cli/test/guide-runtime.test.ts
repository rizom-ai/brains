import { afterEach, describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import docsPackage from "@brains/doc";
import guidesPackage from "@brains/guide";
import { readMarkdownFrontmatter } from "@brains/utils/markdown-frontmatter";
import { z } from "@brains/utils/zod";
import {
  declaredEntityStore,
  type DeclaredEntityStore,
} from "./helpers/declared-entity-store";

/**
 * The declared guide on the brain's own entity store, byte for byte as
 * main's adapter stored it (the bytes in fixtures/guide-main-bytes.json were
 * captured from the guides entity plugin class). A guide reads as its body,
 * its frontmatter as metadata; its file states only the fields it sets, in
 * the order main wrote them. The data sources hand the templates what main's
 * handed them.
 */

const storedSchema = z.object({ content: z.string(), metadata: z.string() });
const readSchema = z.object({
  content: z.string(),
  metadata: z.record(z.string(), z.unknown()),
});
const rowSchema = z.object({
  id: z.string(),
  stored: storedSchema,
  read: readSchema,
  exported: z.string(),
});
const importedSchema = rowSchema.extend({ file: z.string() });
const main = z
  .object({
    full: importedSchema,
    sparse: importedSchema,
    updated: rowSchema,
    sparseUpdated: rowSchema,
    legacy: rowSchema,
    dataSources: z.object({
      chrome: z.record(z.string(), z.unknown()),
      list: z.unknown(),
      detail: z.unknown(),
      sections: z.unknown(),
    }),
  })
  .parse(
    JSON.parse(
      await readFile(
        join(import.meta.dir, "fixtures", "guide-main-bytes.json"),
        "utf8",
      ),
    ),
  );

const EVERY = { visibilityScope: "restricted" } as const;

const stores: DeclaredEntityStore[] = [];
afterEach(async () => {
  for (const store of stores.splice(0)) await store.close();
});

async function store(): Promise<DeclaredEntityStore> {
  const opened = await declaredEntityStore(
    guidesPackage,
    "@brains/guide",
    "guides",
    { projectionSourceRole: "primary" },
    [docsPackage],
    { chrome: main.dataSources.chrome },
  );
  stores.push(opened);
  return opened;
}

interface RowView {
  stored: string | undefined;
  metadata: unknown;
  read: string | undefined;
  readMetadata: unknown;
  exported: string | undefined;
}

async function rowOf(
  opened: DeclaredEntityStore,
  id: string,
): Promise<RowView> {
  const stored = await opened.stored("guide", id);
  const read = await opened.service.getEntity({
    entityType: "guide",
    id,
    ...EVERY,
  });
  const source = await opened.service.getEntity({
    entityType: "guide",
    id,
    ...EVERY,
    source: true,
  });
  return {
    stored: stored?.content,
    metadata: JSON.parse(stored?.metadata ?? "null"),
    read: read?.content,
    readMetadata: read?.metadata,
    exported: source ? opened.service.serializeEntity(source) : undefined,
  };
}

/** Main's row, read as the declared type reads it: its body. */
function asMain(row: z.output<typeof rowSchema>): RowView {
  return {
    stored: row.stored.content,
    metadata: JSON.parse(row.stored.metadata),
    read: readMarkdownFrontmatter(row.read.content).content.trim(),
    readMetadata: row.read.metadata,
    exported: row.exported,
  };
}

async function imported(
  opened: DeclaredEntityStore,
  row: z.output<typeof importedSchema>,
): Promise<void> {
  await opened.service.createEntityFromMarkdown({
    input: { entityType: "guide", id: row.id, markdown: row.file },
  });
}

async function updateBody(
  opened: DeclaredEntityStore,
  id: string,
  from: string,
  to: string,
): Promise<void> {
  const read = await opened.service.getEntity({
    entityType: "guide",
    id,
    ...EVERY,
  });
  if (!read) throw new Error(`Missing guide ${id}`);
  await opened.service.updateEntity({
    entity: { ...read, content: read.content.replace(from, to) },
  });
}

/** A data source's answer without its records' dates, as captured. */
function undated(value: unknown): unknown {
  return JSON.parse(
    JSON.stringify(value, (key: string, field: unknown) =>
      key === "created" || key === "updated" ? undefined : field,
    ),
  );
}

describe("the declared guide on the entity store", () => {
  test("stores imported guides as the guide adapter wrote them", async () => {
    const opened = await store();
    for (const row of [main.full, main.sparse]) {
      await imported(opened, row);
      expect(await rowOf(opened, row.id)).toEqual(asMain(row));
    }
  });

  test("writes an edited body back as main wrote it, stating no unset field", async () => {
    const opened = await store();
    await imported(opened, main.full);
    await imported(opened, main.sparse);
    await updateBody(opened, "writer", "Upload the files", "Upload your files");
    await updateBody(opened, "self-hosting", "Text.", "More text.");
    expect(await rowOf(opened, "writer")).toEqual(asMain(main.updated));
    expect(await rowOf(opened, "self-hosting")).toEqual(
      asMain(main.sparseUpdated),
    );
  });

  test("reads, lists and searches a row stored before section, summary and brings, before the boot pass and after", async () => {
    const opened = await store();
    await opened.service.createEntityFromMarkdown({
      input: {
        entityType: "guide",
        id: "legacy",
        markdown: main.legacy.exported,
      },
    });
    // The row exactly as main stored it, dated as an older row is.
    await opened.rewrite(
      "guide",
      "legacy",
      main.legacy.stored.content,
      main.legacy.stored.metadata,
    );
    await opened.setCreated("guide", "legacy", 1_700_000_000_000);
    await opened.service.createEntityFromMarkdown({
      input: {
        entityType: "doc",
        id: "setup",
        markdown:
          "---\ntitle: Setup\nsection: Getting started\norder: 1\n---\nSteps.\n",
      },
    });
    const before = await opened.stored("guide", "legacy");
    const exportsBefore = await opened.service.listPendingEntityExports();

    const sectionsSchema = opened.shell
      .getTemplates()
      .get("guides:guide-sections")?.schema;
    if (!sectionsSchema) throw new Error("No guide-sections template");

    const expectReadable = async (metadata: unknown): Promise<void> => {
      const row = await rowOf(opened, "legacy");
      expect(row.read).toBe(asMain(main.legacy).read);
      expect(row.exported).toBe(main.legacy.exported);
      expect(row.readMetadata).toEqual(metadata);
      const listed = await opened.service.listEntities({
        entityType: "guide",
        options: { filter: EVERY },
      });
      expect(listed.map(({ id }) => id)).toEqual(["legacy"]);
      const found = await opened.service.search({
        query: "drafts",
        options: { types: ["guide"], ...EVERY },
      });
      expect(found.map(({ entity }) => entity.id)).toEqual(["legacy"]);
      // Listed with the docs section its file names, as main read it from
      // the file.
      const sections = z
        .object({
          sections: z.array(
            z.object({
              name: z.string(),
              guides: z.array(z.object({ id: z.string() })),
            }),
          ),
        })
        .parse(
          await opened.fetchData("guides:sections", {}, sectionsSchema, {
            entityService: opened.service,
          }),
        );
      expect(
        sections.sections.map(({ name, guides }) => [
          name,
          guides.map(({ id }) => id),
        ]),
      ).toEqual([["Getting started", ["legacy"]]]);
    };

    // Before the pass, the metadata its file states, as after it: main read
    // nulls for the fields its stored metadata lacked, and wrote them back
    // from the file. The declared write states what metadata holds, so a
    // row whose stored metadata lacks a field reads it from the file.
    const stated = { ...main.full.read.metadata, slug: "legacy" };
    expect(main.legacy.read.metadata).toEqual({
      ...stated,
      brings: null,
      section: null,
      summary: null,
    });
    await expectReadable(stated);
    expect(await opened.service.reconcileDeclaredMetadata()).toEqual({
      reconciled: 1,
    });
    // After it, the same, now stored.
    await expectReadable(stated);
    const after = await opened.stored("guide", "legacy");
    // The pass rewrote the metadata column alone: content, hash and update
    // time are main's, and nothing waits to be exported.
    expect(after && { ...after, metadata: before?.metadata }).toEqual(before);
    expect(JSON.parse(after?.metadata ?? "null")).toEqual(stated);
    expect(await opened.service.listPendingEntityExports()).toEqual(
      exportsBefore,
    );
  });

  test("hands the templates what main's data sources handed them", async () => {
    const opened = await store();
    await imported(opened, main.full);
    await imported(opened, main.sparse);
    for (const [id, markdown] of [
      [
        "index",
        "---\ntitle: Docs\nsection: Getting started\norder: 0\nslug: index\n---\nHome.\n",
      ],
      [
        "setup",
        "---\ntitle: Setup\nsection: Getting started\norder: 1\ndescription: Set it up.\n---\nSteps.\n",
      ],
      [
        "deploy",
        "---\ntitle: Deploy\nsection: Running\norder: 2\n---\nDeploy.\n",
      ],
    ] as const) {
      await opened.service.createEntityFromMarkdown({
        input: { entityType: "doc", id, markdown },
      });
    }
    const templates = opened.shell.getTemplates();
    const schemaOf = (name: string): z.ZodType => {
      const template = templates.get(name);
      if (!template) throw new Error(`No template ${name}`);
      return template.schema;
    };
    const context = { entityService: opened.service };
    expect(
      undated(
        await opened.fetchData(
          "guides:entities",
          {},
          schemaOf("guides:guide-list"),
          context,
        ),
      ),
    ).toEqual(main.dataSources.list);
    expect(
      undated(
        await opened.fetchData(
          "guides:entities",
          { query: { id: "self-hosting" } },
          schemaOf("guides:guide-detail"),
          context,
        ),
      ),
    ).toEqual(main.dataSources.detail);
    expect(
      undated(
        await opened.fetchData(
          "guides:sections",
          {},
          schemaOf("guides:guide-sections"),
          context,
        ),
      ),
    ).toEqual(main.dataSources.sections);
  });
});
