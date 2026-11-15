import { afterEach, describe, expect, it } from "bun:test";
import { Database } from "bun:sqlite";
import { fileURLToPath } from "node:url";
import { computeContentHash } from "@brains/utils/hash";
import { z } from "@brains/utils/zod";
import { BaseEntityAdapter } from "../src/adapters/base-entity-adapter";
import {
  generateMarkdownWithFrontmatter,
  parseMarkdownWithFrontmatter,
} from "../src/frontmatter";
import { baseEntitySchema } from "../src/types";
import {
  setupEntityService,
  type EntityServiceTestContext,
} from "./helpers/setup-entity-service";

/**
 * A type converted from an entity plugin class to a declaration: the class
 * kept its fields in the content's frontmatter and stored empty metadata,
 * while the declaration's metadata is that frontmatter. Rows the class
 * wrote are reconciled once at startup, the metadata column alone.
 */

const guideFields = z.object({
  name: z.string(),
  tone: z.string().optional(),
});
const guideSchema = baseEntitySchema.extend({ metadata: guideFields });
type Guide = z.infer<typeof guideSchema>;

/** The body, with frontmatter as metadata, from a type that keeps its own. */
class GuideAdapter extends BaseEntityAdapter<Guide, Guide["metadata"]> {
  constructor() {
    super({
      entityType: "guide",
      purpose: "Declared metadata fixture",
      schema: guideSchema,
      frontmatterSchema: guideFields,
    });
  }
  public override toMarkdown(entity: Guide): string {
    return generateMarkdownWithFrontmatter(entity.content, entity.metadata);
  }
  fromMarkdown(markdown: string): Partial<Guide> {
    const parsed = parseMarkdownWithFrontmatter(markdown, guideFields);
    return { content: parsed.content, metadata: parsed.metadata };
  }
  public override extractMetadata(entity: Guide): Guide["metadata"] {
    return entity.metadata;
  }
}

/** As a declared type's adapter reads: its metadata is its frontmatter. */
class DeclaredGuideAdapter extends GuideAdapter {
  public readonly metadataFromFrontmatter = true;
}

/** The markdown the class stored: the fields in frontmatter. */
const CLASS_STORED = "---\nname: House\ntone: plain\n---\nWrite plainly.\n";

let context: EntityServiceTestContext | undefined;
afterEach(async () => {
  await context?.cleanup();
  context = undefined;
});

interface StoredRow {
  content: string;
  contentHash: string;
  metadata: unknown;
  updated: number;
}

async function classWrittenRows(
  rows: Record<string, string>,
  adapter: GuideAdapter = new DeclaredGuideAdapter(),
): Promise<{ service: EntityServiceTestContext; row(id: string): StoredRow }> {
  context = await setupEntityService([
    {
      name: "guide",
      schema: guideSchema,
      adapter,
    },
  ]);
  const { entityService, dbConfig } = context;
  for (const id of Object.keys(rows)) {
    await entityService.createEntity({
      entity: {
        id,
        entityType: "guide",
        content: "Placeholder",
        metadata: { name: "Placeholder" },
      },
    });
  }
  await entityService.acknowledgeEntityExports({
    intents: await entityService.listPendingEntityExports(),
  });
  // The rows as the class wrote them: its markdown, its hash, no metadata.
  const path = fileURLToPath(dbConfig.url);
  const db = new Database(path);
  for (const [id, content] of Object.entries(rows)) {
    db.query(
      "UPDATE entities SET content = ?, contentHash = ?, metadata = ? WHERE id = ?",
    ).run(content, computeContentHash(content), "{}", id);
  }
  db.close();
  const service = context;
  return {
    service,
    row(id): StoredRow {
      const read = new Database(path, { readonly: true });
      const stored = read
        .query(
          "SELECT content, contentHash, metadata, updated FROM entities WHERE id = ?",
        )
        .get(id);
      read.close();
      return z
        .object({
          content: z.string(),
          contentHash: z.string(),
          metadata: z.string().transform((text): unknown => JSON.parse(text)),
          updated: z.number(),
        })
        .parse(stored);
    },
  };
}

describe("declared metadata reconciliation", () => {
  it("stores the metadata a class-written row's markdown declares, as reads derive it", async () => {
    const { service, row } = await classWrittenRows({ house: CLASS_STORED });
    const before = row("house");
    // Unreconciled, a read derives the metadata from the markdown alone.
    expect(
      (
        await service.entityService.getEntity({
          entityType: "guide",
          id: "house",
        })
      )?.metadata,
    ).toEqual({ name: "House", tone: "plain" });
    expect(row("house")).toEqual(before);

    expect(await service.entityService.reconcileDeclaredMetadata()).toEqual({
      reconciled: 1,
    });

    const after = row("house");
    expect(after.metadata).toEqual({ name: "House", tone: "plain" });
    expect(after.content).toBe(before.content);
    expect(after.contentHash).toBe(before.contentHash);
    expect(after.updated).toBe(before.updated);
    const read = await service.entityService.getEntity({
      entityType: "guide",
      id: "house",
    });
    expect(read?.metadata).toEqual({ name: "House", tone: "plain" });
    expect(read?.content.trim()).toBe("Write plainly.");
  });

  it("writes no export and leaves the stored file's hash, so nothing re-imports", async () => {
    const { service, row } = await classWrittenRows({ house: CLASS_STORED });

    await service.entityService.reconcileDeclaredMetadata();

    expect(await service.entityService.listPendingEntityExports()).toEqual([]);
    expect(await service.entityService.hasPendingEntityExports()).toBe(false);
    // Directory sync takes a file whose hash is its entity's write-snapshot
    // hash for its own echo and imports nothing; the snapshot reads, and its
    // hash is still the file's.
    const snapshot = await service.entityService.getEntityWriteSnapshot({
      entityType: "guide",
      id: "house",
      visibilityScope: "restricted",
    });
    expect(snapshot?.entity.contentHash).toBe(computeContentHash(CLASS_STORED));
    expect(row("house").contentHash).toBe(computeContentHash(CLASS_STORED));
  });

  it("is idempotent", async () => {
    const { service, row } = await classWrittenRows({ house: CLASS_STORED });
    await service.entityService.reconcileDeclaredMetadata();
    const once = row("house");

    expect(await service.entityService.reconcileDeclaredMetadata()).toEqual({
      reconciled: 0,
    });
    expect(row("house")).toEqual(once);
  });

  it("logs and leaves a row whose markdown does not decode", async () => {
    const broken = "---\ntone: plain\n---\nNo name.\n";
    const { service, row } = await classWrittenRows({
      house: CLASS_STORED,
      broken,
    });

    expect(await service.entityService.reconcileDeclaredMetadata()).toEqual({
      reconciled: 1,
    });
    expect(row("broken")).toMatchObject({ content: broken, metadata: {} });
    expect(row("house").metadata).toEqual({ name: "House", tone: "plain" });
  });
});

describe("reads of rows whose metadata fails their schema", () => {
  it("leave out a type's row when its metadata is not its frontmatter", async () => {
    const { service, row } = await classWrittenRows(
      { house: CLASS_STORED },
      new GuideAdapter(),
    );
    const before = row("house");

    expect(
      await service.entityService.getEntity({
        entityType: "guide",
        id: "house",
      }),
    ).toBeNull();
    expect(
      await service.entityService.listEntities({ entityType: "guide" }),
    ).toEqual([]);
    expect(row("house")).toEqual(before);
  });
});
