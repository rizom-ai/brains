import { afterEach, describe, expect, test } from "bun:test";
import blogPackage, { blogPostSchema, parsePostData } from "@brains/blog";
import { siteBuildStagingContract } from "@brains/contracts";
import { markEntityPublished } from "@brains/content-pipeline";
import { createMockProgressReporter } from "@brains/test-utils";
import { z } from "@brains/utils/zod";
import { mkdtemp, readFile, rm } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import mainFeeds from "./fixtures/blog-feed-main.json";
import {
  declaredEntityStore,
  type DeclaredEntityStore,
} from "./helpers/declared-entity-store";

/**
 * The declared blog on the brain's own entity store: every post stored as
 * the blog post adapter wrote it, byte for byte, whether imported, updated,
 * generated, stubbed, written from the writer's text or published, and its
 * feed and RSS written as the blog plugin class wrote them.
 */

const stores: DeclaredEntityStore[] = [];
afterEach(async () => {
  for (const store of stores.splice(0)) await store.close();
});

async function store(): Promise<DeclaredEntityStore> {
  const opened = await declaredEntityStore(
    blogPackage,
    "@brains/blog",
    "blog",
    {
      weight: 2.0,
      defaultSort: [{ field: "publishedAt", direction: "desc" }],
      projectionSourceRole: "primary",
      publish: { publishStatuses: ["queued", "published"] },
      retiredFields: ["ogDescription", "twitterCard", "atprotoUri"],
    },
  );
  opened.shell.generateContent = async (config): Promise<unknown> =>
    config.templateName === "blog:excerpt"
      ? { excerpt: "Generated excerpt." }
      : {
          title: "Harbour Notes",
          content: "## Tides\n\nThe tide came in.",
          excerpt: "On tides.",
        };
  stores.push(opened);
  return opened;
}

async function imported(
  opened: DeclaredEntityStore,
  id: string,
  markdown: string,
): Promise<string | undefined> {
  await opened.service.createEntityFromMarkdown({
    input: { entityType: "post", id, markdown },
  });
  return (await opened.stored("post", id))?.content;
}

async function generate(
  opened: DeclaredEntityStore,
  data: unknown,
): Promise<unknown> {
  const handler = opened.shell
    .getJobQueueService()
    .getHandler("post:generation");
  if (!handler) throw new Error("No post generation");
  return handler.process(
    handler.validateAndParse(data),
    "job-under-test",
    createMockProgressReporter(),
    new AbortController().signal,
  );
}

const city =
  "---\ntitle: City Notes\nslug: city-notes\nstatus: published\npublishedAt: 2025-01-01T00:00:00.000Z\nexcerpt: About the city.\nauthor: Alex\ncoverImageId: city-cover\nogImageId: og-city\nseriesName: Cities\nseriesIndex: 2\ncanonicalUrl: https://elsewhere.example/city\n---\n## City\n\nBody\n";
const storedCity =
  "---\ntitle: City Notes\nslug: city-notes\nstatus: published\npublishedAt: '2025-01-01T00:00:00.000Z'\nexcerpt: About the city.\nauthor: Alex\ncoverImageId: city-cover\nogImageId: og-city\nseriesName: Cities\nseriesIndex: 2\ncanonicalUrl: 'https://elsewhere.example/city'\n---\n## City\n\nBody\n";
const noSlug =
  "---\nexcerpt: Desc\ntitle: No Slug\nstatus: draft\nauthor: Alex\ntags: x\n---\nFree text body\n";

describe("the declared posts on the entity store", () => {
  // Each expected document is what BlogPostAdapter.toMarkdown stored for it.
  test.each([
    ["a full post", city, storedCity],
    [
      "a post without a slug, with frontmatter it does not write",
      noSlug,
      "---\ntitle: No Slug\nstatus: draft\nexcerpt: Desc\nauthor: Alex\nslug: no-slug\ntags: x\n---\nFree text body\n",
    ],
    [
      "a blank line after the frontmatter",
      "---\ntitle: Blank\nslug: blank\nstatus: draft\nexcerpt: D\nauthor: Alex\n---\n\n## Context\n\nC",
      "---\ntitle: Blank\nslug: blank\nstatus: draft\nexcerpt: D\nauthor: Alex\n---\n## Context\n\nC\n",
    ],
    [
      "a failed generation",
      "---\ntitle: Failed\nslug: failed\nstatus: failed\nexcerpt: ''\nauthor: AI\nerror: The model refused\n---\n",
      "---\ntitle: Failed\nslug: failed\nstatus: failed\nexcerpt: ''\nauthor: AI\nerror: The model refused\n---\n\n",
    ],
    [
      "a CRLF document",
      "---\r\ntitle: Crlf\r\nstatus: draft\r\nexcerpt: D\r\nauthor: Alex\r\n---\r\nBody\r\n",
      "---\ntitle: Crlf\nstatus: draft\nexcerpt: D\nauthor: Alex\nslug: crlf\n---\nBody\n",
    ],
    [
      "retired fields",
      "---\ntitle: Retired\nstatus: queued\nexcerpt: D\nauthor: Alex\nogDescription: old\ntwitterCard: summary\n---\nBody\n",
      "---\ntitle: Retired\nstatus: queued\nexcerpt: D\nauthor: Alex\nslug: retired\n---\nBody\n",
    ],
  ])(
    "stores %s as the blog post adapter wrote it",
    async (_, markdown, content) => {
      const opened = await store();
      expect(await imported(opened, "post-1", markdown)).toBe(content);
    },
  );

  test.each([
    [city, "Body", "Changed", storedCity.replace("Body", "Changed")],
    [
      noSlug,
      "Free text",
      "Changed text",
      // Once stored, the file states its slug.
      "---\ntitle: No Slug\nslug: no-slug\nstatus: draft\nexcerpt: Desc\nauthor: Alex\ntags: x\n---\nChanged text body\n",
    ],
  ])(
    "keeps a post's form through an update of its body: %s",
    async (markdown, from, to, updated) => {
      const opened = await store();
      await imported(opened, "post-1", markdown);
      const read = await opened.service.getEntity({
        entityType: "post",
        id: "post-1",
      });
      if (!read) throw new Error("Missing post");
      await opened.service.updateEntity({
        entity: { ...read, content: read.content.replace(from, to) },
      });
      expect((await opened.stored("post", "post-1"))?.content).toBe(updated);
    },
  );

  test("stores a post the content pipeline published as the adapter did", async () => {
    const opened = await store();
    await imported(
      opened,
      "queued",
      "---\ntitle: Queued Post\nstatus: queued\nexcerpt: Soon.\nauthor: Alex\ncoverImageId: cov\n---\nQueued body\n",
    );
    const read = await opened.service.getEntity({
      entityType: "post",
      id: "queued",
    });
    if (!read) throw new Error("Missing post");
    await markEntityPublished(
      { entityService: opened.service },
      read,
      { id: "internal" },
      { publishedAt: "2026-01-01T00:00:00.000Z" },
    );
    expect((await opened.stored("post", "queued"))?.content).toBe(
      "---\ntitle: Queued Post\nslug: queued-post\nstatus: published\npublishedAt: '2026-01-01T00:00:00.000Z'\nexcerpt: Soon.\nauthor: Alex\ncoverImageId: cov\n---\nQueued body\n",
    );
  });
});

describe("a declared post as a site reads it", () => {
  test("parses as the class read it: its stored document, frontmatter and body", async () => {
    const opened = await store();
    await imported(opened, "city-notes", city);
    const [read] = await opened.service.listEntities(
      { entityType: "post" },
      blogPostSchema,
    );
    if (!read) throw new Error("Missing post");
    const parsed = parsePostData(read);
    expect(parsed.content).toBe(storedCity);
    expect(parsed.body).toBe("## City\n\nBody");
    expect(parsed.frontmatter).toEqual({
      title: "City Notes",
      slug: "city-notes",
      status: "published",
      publishedAt: "2025-01-01T00:00:00.000Z",
      excerpt: "About the city.",
      author: "Alex",
      coverImageId: "city-cover",
      ogImageId: "og-city",
      seriesName: "Cities",
      seriesIndex: 2,
      canonicalUrl: "https://elsewhere.example/city",
    });
  });
});

describe("the blog's data source on the entity store", () => {
  // As the blog plugin class read them: neighbors newest first, a series by
  // its order with an unplaced post first, a page counted over every post.
  test("shows a post with its neighbors and series, and pages the list", async () => {
    const opened = await store();
    const posts = [
      ["two", "published", "2025-03-01T00:00:00.000Z", 2],
      ["one", "published", "2025-01-01T00:00:00.000Z", 1],
      ["loose", "draft", undefined, undefined],
      ["other", "published", "2025-02-01T00:00:00.000Z", undefined],
    ] as const;
    for (const [id, status, publishedAt, seriesIndex] of posts) {
      await imported(
        opened,
        id,
        [
          "---",
          `title: ${id}`,
          `slug: ${id}`,
          `status: ${status}`,
          ...(publishedAt ? [`publishedAt: ${publishedAt}`] : []),
          "excerpt: E",
          "author: A",
          ...(id === "other" ? [] : ["seriesName: Tides"]),
          ...(seriesIndex ? [`seriesIndex: ${seriesIndex}`] : []),
          "---",
          `${id} body`,
          "",
        ].join("\n"),
      );
    }
    const detail = z.looseObject({
      post: z.looseObject({ id: z.string(), content: z.string() }),
      prevPost: z.looseObject({ id: z.string() }).nullable(),
      nextPost: z.looseObject({ id: z.string() }).nullable(),
      seriesPosts: z.array(z.looseObject({ id: z.string() })).nullable(),
    });
    const shown = async (slug: string): Promise<unknown> => {
      const read = await opened.fetchData(
        "blog:entities",
        { entityType: "post", query: { id: slug } },
        detail,
        { entityService: opened.service },
      );
      return {
        post: read.post.id,
        prev: read.prevPost?.id ?? null,
        next: read.nextPost?.id ?? null,
        series: read.seriesPosts?.map((entry) => entry.id) ?? null,
      };
    };
    expect(await shown("two")).toEqual({
      post: "two",
      prev: null,
      next: "other",
      series: ["loose", "one", "two"],
    });
    expect(await shown("loose")).toEqual({
      post: "loose",
      prev: "one",
      next: null,
      series: ["loose", "one", "two"],
    });
    expect(await shown("other")).toEqual({
      post: "other",
      prev: "two",
      next: "one",
      series: null,
    });
    const page = await opened.fetchData(
      "blog:entities",
      { entityType: "post", query: { page: 1, pageSize: 2 } },
      z.looseObject({
        posts: z.array(z.looseObject({ id: z.string() })),
        pagination: z.unknown(),
      }),
      { entityService: opened.service },
    );
    expect(page.posts.map((entry) => entry.id)).toEqual(["two", "other"]);
    expect(page.pagination).toEqual({
      currentPage: 1,
      totalPages: 2,
      totalItems: 4,
      pageSize: 2,
      hasNextPage: true,
      hasPrevPage: false,
    });
  });
});

describe("the declared post generation on the entity store", () => {
  test.each([
    [
      { prompt: "harbour tides" },
      "Harbour Notes",
      "---\ntitle: Harbour Notes\nslug: harbour-notes\nstatus: draft\nexcerpt: On tides.\nauthor: Test Owner\n---\n## Tides\n\nThe tide came in.\n",
    ],
    [
      { title: "Skeleton Post", skipAi: true },
      "Skeleton Post",
      "---\ntitle: Skeleton Post\nslug: skeleton-post\nstatus: draft\nexcerpt: Blog post about Skeleton Post\nauthor: Test Owner\n---\n## Introduction\n\nAdd your introduction here.\n\n## Main Content\n\nAdd your main content here.\n\n## Conclusion\n\nAdd your conclusion here.\n",
    ],
    [
      {
        title: "All Given",
        content: "All body.",
        excerpt: "All ex.",
        author: "Sam",
        status: "published",
        publishedAt: "2025-02-02T00:00:00.000Z",
        canonicalUrl: "https://x.example/a",
        coverImageId: "cov",
      },
      "All Given",
      "---\ntitle: All Given\nslug: all-given\nstatus: published\npublishedAt: '2025-02-02T00:00:00.000Z'\nexcerpt: All ex.\nauthor: Sam\ncoverImageId: cov\ncanonicalUrl: 'https://x.example/a'\n---\nAll body.\n",
    ],
  ])(
    "writes a generated post under its title: %o",
    async (data, id, content) => {
      const opened = await store();
      expect(await generate(opened, data)).toEqual({
        success: true,
        entityId: id,
        title: id,
        slug: id.toLowerCase().replaceAll(" ", "-"),
      });
      expect((await opened.stored("post", id))?.content).toBe(content);
    },
  );

  test("writes an excerpt for a given body and counts its place in a series", async () => {
    const opened = await store();
    await imported(opened, "city-notes", city);
    await generate(opened, {
      title: "Given Title",
      content: "Given body.",
      seriesName: "Cities",
    });
    expect((await opened.stored("post", "Given Title"))?.content).toBe(
      "---\ntitle: Given Title\nslug: given-title\nstatus: draft\nexcerpt: Generated excerpt.\nauthor: Test Owner\nseriesName: Cities\nseriesIndex: 2\n---\nGiven body.\n",
    );
  });

  test("stores system_generate's stub and fills it", async () => {
    const opened = await store();
    const adapter = opened.shell.getEntityRegistry().getAdapter("post");
    const stub = adapter.buildStub?.({ id: "alloc", title: "Alloc" });
    if (!stub) throw new Error("The post builds no stub");
    await opened.service.createEntity({
      entity: { id: "alloc", entityType: "post", ...stub },
    });
    expect((await opened.stored("post", "alloc"))?.content).toBe(
      "---\ntitle: Alloc\nslug: alloc\nstatus: generating\nexcerpt: ''\nauthor: AI\n---\n\n",
    );
    expect(
      await generate(opened, {
        prompt: "fill",
        title: "Alloc",
        entityId: "alloc",
      }),
    ).toEqual({
      success: true,
      entityId: "alloc",
      title: "Alloc",
      slug: "alloc",
    });
    expect((await opened.stored("post", "alloc"))?.content).toBe(
      "---\ntitle: Alloc\nslug: alloc\nstatus: draft\nexcerpt: On tides.\nauthor: Test Owner\n---\n## Tides\n\nThe tide came in.\n",
    );
  });
});

describe("the blog's feed on the entity store", () => {
  // The posts main's feed pin was written from, with their creation times.
  const posts: Array<{ id: string; markdown: string; created: number }> = [
    {
      id: "city-notes",
      created: Date.parse("2025-01-01T08:00:00.000Z"),
      markdown:
        "---\ntitle: City Notes\nslug: city-notes\nstatus: published\npublishedAt: 2025-01-01T09:00:00.000Z\nexcerpt: About the city & its <streets>.\nauthor: Alex\nseriesName: Cities\nseriesIndex: 1\n---\n## City\n\nThe city ]]> at dusk.\n",
    },
    {
      id: "harbour",
      created: Date.parse("2025-02-01T08:00:00.000Z"),
      markdown:
        "---\ntitle: Harbour\nstatus: published\npublishedAt: 2025-02-02T00:00:00.000Z\nexcerpt: Tides.\nauthor: Sam\n---\nThe tide came in.\n",
    },
    {
      id: "undated",
      created: Date.parse("2025-03-01T08:00:00.000Z"),
      markdown:
        "---\ntitle: Undated\nslug: undated\nstatus: published\nexcerpt: No date.\nauthor: Alex\n---\nUndated body\n",
    },
    {
      id: "draft",
      created: Date.parse("2025-04-01T08:00:00.000Z"),
      markdown:
        "---\ntitle: Draft\nslug: draft\nstatus: draft\nexcerpt: Not yet.\nauthor: Alex\nseriesName: Cities\n---\nDraft body\n",
    },
    {
      id: "queued",
      created: Date.parse("2025-05-01T08:00:00.000Z"),
      markdown:
        "---\ntitle: Queued\nslug: queued\nstatus: queued\nexcerpt: Soon.\nauthor: Alex\n---\nQueued body\n",
    },
  ];
  const sites = {
    plain: {
      title: "Alex",
      description: "Writing",
      url: "https://alex.example",
    },
    slash: { url: "https://alex.example/", copyright: "(c) Alex" },
  };

  async function seeded(): Promise<DeclaredEntityStore> {
    const opened = await store();
    for (const { id, markdown, created } of posts) {
      await imported(opened, id, markdown);
      await opened.setCreated("post", id, created);
    }
    return opened;
  }

  test.each([
    ["preview", "plain"],
    ["preview", "slash"],
    ["production", "plain"],
    ["production", "slash"],
  ] as const)(
    "writes the %s feed for a %s site URL as the class wrote it",
    async (environment, site) => {
      const opened = await seeded();
      const outputDir = await mkdtemp(join(tmpdir(), "blog-feed-"));
      try {
        await opened.shell.getMessageBus().send({
          type: siteBuildStagingContract.name,
          payload: {
            outputDir,
            environment,
            routesBuilt: 1,
            siteConfig: sites[site],
            generateEntityUrl: (type: string, slug: string): string =>
              `/${type}s/${slug}`,
            reportFailure: (detail: string): void => {
              throw new Error(detail);
            },
          },
          sender: "site-builder",
          broadcast: true,
        });
        expect(await readFile(join(outputDir, "feed.xml"), "utf8")).toBe(
          mainFeeds[`${environment}-${site}`],
        );
      } finally {
        await rm(outputDir, { recursive: true, force: true });
      }
    },
  );

  test("answers the RSS data source as the class did", async () => {
    const opened = await seeded();
    const result = await opened.fetchData(
      "blog:rss",
      {
        siteUrl: "https://alex.example/",
        title: "T",
        description: "D",
        language: "fr-fr",
        copyright: "C",
      },
      z.object({ xml: z.string() }),
      { entityService: opened.service },
    );
    expect(result.xml).toBe(mainFeeds.rss);
  });
});

describe("a post written from the writer's text on the entity store", () => {
  test("hands a complete post document and a prompt to the ordinary create", async () => {
    const opened = await store();
    const intercept = opened.shell
      .getEntityRegistry()
      .getCreateInterceptor("post");
    if (!intercept) throw new Error("No post create interceptor");
    const caller = {
      interfaceType: "cli",
      actor: { kind: "user", userId: "u" },
      userPermissionLevel: "admin",
      conversationId: "conv-1",
    } as const;
    expect(
      await intercept(
        {
          entityType: "post",
          content:
            "---\ntitle: Done\nstatus: draft\nexcerpt: E\nauthor: A\n---\nBody",
        },
        caller,
      ),
    ).toEqual({
      kind: "continue",
      input: {
        entityType: "post",
        content:
          "---\ntitle: Done\nstatus: draft\nexcerpt: E\nauthor: A\n---\nBody",
      },
    });
    expect(
      await intercept(
        { entityType: "post", prompt: "write about tides" },
        caller,
      ),
    ).toEqual({
      kind: "continue",
      input: { entityType: "post", prompt: "write about tides" },
    });
  });
});
