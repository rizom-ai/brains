import { afterEach, describe, expect, test } from "bun:test";
import seriesPackage from "@brains/series";
import { scopeEntityReads } from "@brains/entity-service";
import { defineEntity, defineEntityPackage } from "@brains/plugins";
import { z } from "@brains/utils/zod";
import {
  declaredEntityStore,
  type DeclaredEntityStore,
} from "./helpers/declared-entity-store";

/**
 * The declared series on the brain's own entity store: stored as the series
 * adapter wrote it, its cover kept in its frontmatter and metadata, and its
 * pages read across every type at the build's scope.
 */

const stores: DeclaredEntityStore[] = [];
afterEach(async () => {
  for (const store of stores.splice(0)) await store.close();
});

// Another package's type whose records join a series by name.
const post = defineEntity({
  type: "post",
  purpose: "A post.",
  metadata: z.object({
    title: z.string(),
    slug: z.string(),
    seriesName: z.string().optional(),
    seriesIndex: z.number().optional(),
  }),
});
const posts = defineEntityPackage({ id: "posts", entities: [post] });

async function store(): Promise<DeclaredEntityStore> {
  const opened = await declaredEntityStore(
    seriesPackage,
    "@brains/series",
    "series",
    { weight: 0.5, projectionSourceRole: "supporting" },
    [posts],
  );
  stores.push(opened);
  return opened;
}

const described =
  "---\ntitle: Systems\nslug: systems\n---\n# Systems\n\n## Description\n\nHow the pieces connect.";
const covered =
  "---\ntitle: Systems\nslug: systems\ncoverImageId: systems-cover\n---\n# Systems\n\n## Description\n\nHow the pieces connect.\n";

async function create(
  opened: DeclaredEntityStore,
  markdown: string,
): Promise<void> {
  await opened.service.createEntityFromMarkdown({
    input: { entityType: "series", id: "systems", markdown },
  });
}

describe("the declared series on the entity store", () => {
  test("stores a series as the series adapter wrote it", async () => {
    const opened = await store();
    await create(opened, described);

    // What SeriesAdapter.toMarkdown wrote for this document.
    expect((await opened.stored("series", "systems"))?.content).toBe(
      "---\ntitle: Systems\nslug: systems\n---\n# Systems\n\n## Description\nHow the pieces connect.\n",
    );
  });

  test("keeps a cover in its frontmatter and its metadata", async () => {
    const opened = await store();
    await create(opened, covered);

    const stored = await opened.stored("series", "systems");
    expect(stored?.content).toBe(
      "---\ntitle: Systems\nslug: systems\ncoverImageId: systems-cover\n---\n# Systems\n\n## Description\nHow the pieces connect.\n",
    );
    expect(JSON.parse(stored?.metadata ?? "{}")).toEqual({
      title: "Systems",
      slug: "systems",
      coverImageId: "systems-cover",
    });
  });

  test("keeps its frontmatter, cover included, through a body-only update", async () => {
    const opened = await store();
    await create(opened, covered);
    const read = await opened.service.getEntity({
      entityType: "series",
      id: "systems",
    });
    if (!read) throw new Error("Missing series");

    await opened.service.updateEntity({
      entity: { ...read, content: "# Systems\n\n## Description\n\nRetold." },
    });

    expect((await opened.stored("series", "systems"))?.content).toBe(
      "---\ntitle: Systems\nslug: systems\ncoverImageId: systems-cover\n---\n# Systems\n\n## Description\nRetold.\n",
    );
  });

  test("reads the cover of a series the class wrote once its metadata is reconciled", async () => {
    const opened = await store();
    await create(opened, covered);
    const classWritten =
      "---\ntitle: Systems\nslug: systems\ncoverImageId: systems-cover\n---\n# Systems\n\n## Description\nHow the pieces connect.\n";
    await opened.rewrite(
      "series",
      "systems",
      classWritten,
      JSON.stringify({ title: "Systems", slug: "systems" }),
    );

    await opened.service.reconcileDeclaredMetadata();

    const stored = await opened.stored("series", "systems");
    expect(stored?.content).toBe(classWritten);
    expect(JSON.parse(stored?.metadata ?? "{}")).toEqual({
      title: "Systems",
      slug: "systems",
      coverImageId: "systems-cover",
    });
  });
});

const listSchema = z.object({
  series: z.array(
    z.looseObject({
      content: z.string(),
      metadata: z.unknown(),
      frontmatter: z.unknown(),
      description: z.string().optional(),
      postCount: z.number(),
    }),
  ),
});
const detailSchema = z.object({
  seriesName: z.string(),
  posts: z.array(z.looseObject({ id: z.string() })),
  series: z.looseObject({ description: z.string().optional() }),
  description: z.string().optional(),
});

describe("the series data source", () => {
  async function seeded(): Promise<DeclaredEntityStore> {
    const opened = await store();
    await create(opened, covered);
    const members = [
      { id: "second", seriesIndex: 2, visibility: "public" },
      { id: "first", seriesIndex: 1, visibility: "public" },
      { id: "private", seriesIndex: 3, visibility: "restricted" },
    ] as const;
    for (const member of members) {
      await opened.service.createEntity({
        entity: {
          id: member.id,
          entityType: "post",
          content: `About ${member.id}`,
          metadata: {
            title: member.id,
            slug: member.id,
            seriesName: "Systems",
            seriesIndex: member.seriesIndex,
          },
          visibility: member.visibility,
        },
      });
    }
    return opened;
  }

  test("lists each series with its document, cover, description and public members", async () => {
    const opened = await seeded();
    const preview = scopeEntityReads(opened.service, {
      visibilityScope: "public",
    });

    const listed = await opened.fetchData(
      "series:entities",
      { type: "list" },
      listSchema,
      { entityService: preview },
    );

    expect(listed.series).toHaveLength(1);
    const [systems] = listed.series;
    expect(systems?.content).toBe(
      "---\ntitle: Systems\nslug: systems\ncoverImageId: systems-cover\n---\n# Systems\n\n## Description\nHow the pieces connect.\n",
    );
    expect(systems?.metadata).toEqual({ title: "Systems", slug: "systems" });
    expect(systems?.frontmatter).toEqual({
      title: "Systems",
      slug: "systems",
      coverImageId: "systems-cover",
    });
    expect(systems?.description).toBe("How the pieces connect.");
    expect(systems?.postCount).toBe(2);
  });

  test("answers a slug with the series' public members in series order", async () => {
    const opened = await seeded();
    const preview = scopeEntityReads(opened.service, {
      visibilityScope: "public",
    });

    const detail = await opened.fetchData(
      "series:entities",
      { entityType: "series", query: { id: "systems" } },
      detailSchema,
      {
        entityService: preview,
      },
    );

    expect(detail.seriesName).toBe("Systems");
    expect(detail.posts.map(({ id }) => id)).toEqual(["first", "second"]);
    expect(detail.description).toBe("How the pieces connect.");
    expect(detail.series.description).toBe("How the pieces connect.");
  });

  test("refuses a slug no series has", async () => {
    const opened = await seeded();

    expect(
      opened.fetchData(
        "series:entities",

        { entityType: "series", query: { id: "unknown" } },
        detailSchema,
        {
          entityService: opened.service,
        },
      ),
    ).rejects.toThrow("Series not found with slug: unknown");
  });
});
