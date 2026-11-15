import { afterEach, describe, expect, test } from "bun:test";
import blogPackage from "@brains/blog";
import linkPackage from "@brains/link";
import { internalFullScope } from "@brains/plugins";
import portfolioPackage from "@brains/portfolio";
import styleGuidePackage, {
  createStyleGuideContent,
} from "@brains/style-guide";
import {
  declaredEntityStore,
  type DeclaredEntityStore,
} from "./helpers/declared-entity-store";

/**
 * Rows an entity plugin class stored before its type became a declaration,
 * read before the boot pass re-derives their metadata: the class stored
 * metadata the declared schema no longer accepts, so a read re-derives it
 * from the stored markdown, as the pass will, and writes nothing.
 */

const stores: DeclaredEntityStore[] = [];
afterEach(async () => {
  for (const store of stores.splice(0)) await store.close();
});

async function opened(
  ...args: Parameters<typeof declaredEntityStore>
): Promise<DeclaredEntityStore> {
  const store = await declaredEntityStore(...args);
  stores.push(store);
  return store;
}

const openBlog = (): Promise<DeclaredEntityStore> =>
  opened(blogPackage, "@brains/blog", "blog", {
    weight: 2.0,
    defaultSort: [{ field: "publishedAt", direction: "desc" }],
    projectionSourceRole: "primary",
    publish: { publishStatuses: ["queued", "published"] },
    retiredFields: ["ogDescription", "twitterCard", "atprotoUri"],
  });
const openLinks = (): Promise<DeclaredEntityStore> =>
  opened(linkPackage, "@brains/link", "link", {
    projectionSourceRole: "supporting",
    retiredFields: ["domain"],
  });
const openPortfolio = (): Promise<DeclaredEntityStore> =>
  opened(portfolioPackage, "@brains/portfolio", "portfolio", {
    projectionSourceRole: "secondary",
  });
const openStyleGuide = (): Promise<DeclaredEntityStore> =>
  opened(styleGuidePackage, "@brains/style-guide", "style-guide", {
    classification: "system",
    embeddable: false,
  });

/** A row as the type's entity plugin class stored it. */
interface ClassRow {
  open(): Promise<DeclaredEntityStore>;
  entityType: string;
  id: string;
  /** The markdown the class's adapter wrote. */
  content: string;
  /** The metadata the class's adapter stored beside it. */
  metadata: Record<string, unknown>;
  /** A word of the body, for a keyword search. */
  word: string;
  /** What the declared metadata reads from the markdown that the class's lacked. */
  derived: Record<string, unknown>;
}

// BlogPostAdapter.fromMarkdown (a693fbb93f^) stored title, slug, status,
// publishedAt and the series fields; excerpt and author stayed in content.
const post: ClassRow = {
  open: openBlog,
  entityType: "post",
  id: "city-notes",
  content:
    "---\ntitle: City Notes\nslug: city-notes\nstatus: published\npublishedAt: '2025-01-01T00:00:00.000Z'\nexcerpt: About the city.\nauthor: Alex\nseriesName: Cities\nseriesIndex: 2\n---\n## City\n\nHarbourside body\n",
  metadata: {
    title: "City Notes",
    slug: "city-notes",
    status: "published",
    publishedAt: "2025-01-01T00:00:00.000Z",
    seriesName: "Cities",
    seriesIndex: 2,
  },
  word: "Harbourside",
  derived: { excerpt: "About the city.", author: "Alex" },
};

// LinkAdapter.fromMarkdown (bfefbe5602^) stored title, status and
// capturedAt; url and source stayed in content.
const link: ClassRow = {
  open: openLinks,
  entityType: "link",
  id: "example-com-a",
  content:
    "---\nstatus: published\ntitle: Example\nurl: 'https://example.com/a'\ndescription: An example.\ncapturedAt: '2025-01-01T00:00:00.000Z'\nsource:\n  ref: 'cli:local'\n  label: CLI\n---\nHarbourside summary\n",
  metadata: {
    title: "Example",
    status: "published",
    capturedAt: "2025-01-01T00:00:00.000Z",
  },
  word: "Harbourside",
  derived: {
    url: "https://example.com/a",
    source: { ref: "cli:local", label: "CLI" },
  },
};

// ProjectAdapter.fromMarkdown (5822541289^) stored description only from
// 2026-10-31; a project stored before kept it in content alone.
const project: ClassRow = {
  open: openPortfolio,
  entityType: "project",
  id: "city-pulse",
  content:
    "---\ntitle: City Pulse\nslug: city-pulse\nstatus: published\npublishedAt: '2025-01-01T00:00:00.000Z'\ndescription: Sensing a city.\nyear: 2024\n---\n## Context\n\nHarbourside context\n\n## Problem\n\nP\n\n## Solution\n\nS\n\n## Outcome\n\nO\n",
  metadata: {
    title: "City Pulse",
    slug: "city-pulse",
    status: "published",
    publishedAt: "2025-01-01T00:00:00.000Z",
    year: 2024,
  },
  word: "Harbourside",
  derived: { description: "Sensing a city." },
};

// StyleGuideAdapter.extractMetadata (463d6df46c^) stored no metadata.
const styleGuide: ClassRow = {
  open: openStyleGuide,
  entityType: "style-guide",
  id: "style-guide",
  content: createStyleGuideContent(
    { name: "House", voice: { summary: "Plain words" } },
    "Harbourside guidance.",
  ),
  metadata: {},
  word: "Harbourside",
  derived: { name: "House", voice: { summary: "Plain words" } },
};

/** The store with the row in it as the class stored it, the pass not run. */
async function classStored(row: ClassRow): Promise<DeclaredEntityStore> {
  const store = await row.open();
  // Imported first, so its keyword index holds it as the class indexed it.
  await store.service.createEntityFromMarkdown({
    input: { entityType: row.entityType, id: row.id, markdown: row.content },
  });
  await store.rewrite(
    row.entityType,
    row.id,
    row.content,
    JSON.stringify(row.metadata),
  );
  return store;
}

type Service = DeclaredEntityStore["service"];
type Read = (
  service: Service,
  row: ClassRow,
) => Promise<Record<string, unknown> | undefined>;

const snapshotScope = internalFullScope("plan a directory import");

/** Each read path, as a reader reaches the row. */
const reads: Array<[string, Read]> = [
  [
    "a get",
    async (service, row): ReturnType<Read> =>
      (await service.getEntity({ entityType: row.entityType, id: row.id }))
        ?.metadata,
  ],
  [
    "a listing",
    async (service, row): ReturnType<Read> =>
      (await service.listEntities({ entityType: row.entityType })).find(
        (entity) => entity.id === row.id,
      )?.metadata,
  ],
  [
    "a search",
    async (service, row): ReturnType<Read> =>
      (
        await service.search({
          query: row.word,
          options: { types: [row.entityType] },
        })
      ).find((result) => result.entity.id === row.id)?.entity.metadata,
  ],
  [
    "a write snapshot",
    async (service, row): ReturnType<Read> =>
      (
        await service.getEntityWriteSnapshot({
          entityType: row.entityType,
          id: row.id,
          visibilityScope: snapshotScope,
        })
      )?.entity.metadata,
  ],
];

describe.each([
  ["a post", post],
  ["a link", link],
  ["a project", project],
  ["the style guide", styleGuide],
])("%s a class stored, read before the boot pass", (_, row) => {
  test.each(reads)(
    "%s reads it with the metadata its markdown declares",
    async (_, read) => {
      const { service } = await classStored(row);

      expect(await read(service, row)).toMatchObject({
        ...row.metadata,
        ...row.derived,
      });
    },
  );

  test("its reads write nothing, and derive what the boot pass stores", async () => {
    const store = await classStored(row);
    const before = await store.stored(row.entityType, row.id);

    const derived: unknown[] = await Promise.all(
      reads.map(([, read]) => read(store.service, row)),
    );

    // The metadata column, hash and time stay as the class stored them.
    expect(await store.stored(row.entityType, row.id)).toEqual(before);
    await store.service.reconcileDeclaredMetadata();
    const reconciled: unknown = JSON.parse(
      (await store.stored(row.entityType, row.id))?.metadata ?? "",
    );
    expect(derived).toEqual(reads.map(() => reconciled));
  });
});

describe("rows a class stored, rewritten and read before the boot pass", () => {
  test.each([
    [
      "a post",
      {
        ...post,
        content: post.content.replace(
          "author: Alex\n",
          "author: Alex\nogDescription: old\n",
        ),
      },
      "ogDescription",
    ],
    [
      "a link",
      {
        ...link,
        content: link.content.replace(
          "  label: CLI\n",
          "  label: CLI\ndomain: example.com\n",
        ),
      },
      "domain",
    ],
  ])(
    "rewrites %s carrying a retired field before its metadata is reconciled",
    async (_, row, retired) => {
      const store = await classStored(row);

      await store.service.rewriteRetiredFields();

      const after = await store.stored(row.entityType, row.id);
      expect(after?.content).not.toContain(`${retired}:`);
      expect(after?.content).toContain(row.word);
      expect(JSON.parse(after?.metadata ?? "")).toMatchObject(row.derived);
    },
  );

  test("leaves out a row whose markdown does not decode either", async () => {
    // A class-stored post whose content lost its excerpt and author too.
    const broken: ClassRow = {
      ...post,
      content: post.content.replace(
        "excerpt: About the city.\nauthor: Alex\n",
        "",
      ),
    };
    const store = await classStored(post);
    await store.rewrite(
      broken.entityType,
      broken.id,
      broken.content,
      JSON.stringify(broken.metadata),
    );
    const { service } = store;
    const before = await store.stored(broken.entityType, broken.id);
    const ref = { entityType: broken.entityType, id: broken.id };

    expect(await service.getEntity(ref)).toBeNull();
    expect(
      await service.listEntities({ entityType: broken.entityType }),
    ).toEqual([]);
    expect(
      await service.search({
        query: broken.word,
        options: { types: [broken.entityType] },
      }),
    ).toEqual([]);
    expect(
      await service
        .getEntityWriteSnapshot({ ...ref, visibilityScope: snapshotScope })
        .then(
          () => "planned",
          (error: unknown) =>
            error instanceof Error ? error.message : String(error),
        ),
    ).toBe("Cannot deserialize entity write snapshot");
    expect(await store.stored(broken.entityType, broken.id)).toEqual(before);
  });
});
