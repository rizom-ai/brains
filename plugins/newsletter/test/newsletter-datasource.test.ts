import { beforeEach, describe, expect, it } from "bun:test";
import { createTestEntity } from "@brains/entity-service/test";
import {
  createDeclarativeEntityDataSource,
  type BaseDataSourceContext,
} from "@brains/plugins";
import { createMockShell, type MockShell } from "@brains/plugins/test";
import { createMockLogger } from "@brains/test-utils";
import { z } from "@brains/utils/zod";
import { newsletterDataSource } from "../src/datasources/newsletter-datasource";
import type { Newsletter } from "../src/schemas/newsletter";
import { newsletterDetailSchema } from "../src/templates/newsletter-detail";
import { newsletterListSchema } from "../src/templates/newsletter-list";

const SCOPED_ID = "@brains/newsletter:entities";

describe("newsletter data source", () => {
  let datasource: ReturnType<typeof createDeclarativeEntityDataSource>;
  let shell: MockShell;
  let context: BaseDataSourceContext;

  const newsletter = (
    id: string,
    subject: string,
    status: "draft" | "queued" | "published" | "failed",
    options: {
      content?: string;
      sentAt?: string;
      scheduledFor?: string;
      entityIds?: string[];
      sourceEntityType?: string;
      created?: string;
    } = {},
  ): Newsletter =>
    createTestEntity<Newsletter>("newsletter", {
      id,
      content: options.content ?? "Newsletter content",
      ...(options.created && {
        created: options.created,
        updated: options.created,
      }),
      metadata: {
        subject,
        status,
        ...(options.sentAt && { sentAt: options.sentAt }),
        ...(options.scheduledFor && { scheduledFor: options.scheduledFor }),
        ...(options.entityIds && { entityIds: options.entityIds }),
        ...(options.sourceEntityType && {
          sourceEntityType: options.sourceEntityType,
        }),
      },
    });

  const list = (
    query: Record<string, unknown> = {},
  ): Promise<z.output<typeof newsletterListSchema>> =>
    datasource.fetch({ query }, newsletterListSchema, context);
  const detail = (
    id: string,
  ): Promise<z.output<typeof newsletterDetailSchema>> =>
    datasource.fetch({ query: { id } }, newsletterDetailSchema, context);

  beforeEach(() => {
    shell = createMockShell();
    context = { entityService: shell.getEntityService() };
    datasource = createDeclarativeEntityDataSource(
      newsletterDataSource,
      SCOPED_ID,
      createMockLogger(),
    );
  });

  it("is registered under the package-scoped id the runtime gives it", () => {
    expect(newsletterDataSource.id).toBe("entities");
    expect(datasource.id).toBe(SCOPED_ID);
    expect(datasource.description).toContain("newsletter entities");
  });

  describe("list", () => {
    it("lists newsletters newest first, with an excerpt of the body", async () => {
      shell.addEntities([
        newsletter("nl-2", "Second", "draft", {
          content: "Content 2",
          created: "2025-01-01T10:00:00.000Z",
        }),
        newsletter("nl-1", "First", "published", {
          content: "---\nsubject: First\nstatus: published\n---\n\nContent 1",
          sentAt: "2025-01-02T10:00:00.000Z",
          created: "2025-01-02T10:00:00.000Z",
        }),
      ]);

      const result = await list();

      expect(result.newsletters.map(({ id }) => id)).toEqual(["nl-1", "nl-2"]);
      expect(result.totalCount).toBe(2);
      expect(result.newsletters[0]).toMatchObject({
        subject: "First",
        status: "published",
        excerpt: "Content 1",
        sentAt: "2025-01-02T10:00:00.000Z",
        url: "/newsletters/nl-1",
      });
      expect(result.newsletters[1]?.sentAt).toBeNull();
    });

    it("lists nothing when there are no newsletters", async () => {
      const result = await list();

      expect(result.newsletters).toEqual([]);
      expect(result.totalCount).toBe(0);
    });

    it("respects a limit", async () => {
      shell.addEntities([
        newsletter("nl-1", "One", "draft", {
          created: "2025-01-01T00:00:00.000Z",
        }),
        newsletter("nl-2", "Two", "draft", {
          created: "2025-01-02T00:00:00.000Z",
        }),
        newsletter("nl-3", "Three", "draft", {
          created: "2025-01-03T00:00:00.000Z",
        }),
      ]);

      const result = await list({ limit: 2 });

      expect(result.newsletters).toHaveLength(2);
    });

    it("filters by status in the query itself, so paging stays over the filtered set", async () => {
      shell.addEntities([
        newsletter("nl-1", "Sent", "published"),
        newsletter("nl-2", "Draft", "draft"),
        newsletter("nl-3", "Also sent", "published"),
      ]);

      const result = await list({ status: "published" });

      expect(result.newsletters.map(({ id }) => id).sort()).toEqual([
        "nl-1",
        "nl-3",
      ]);
      expect(result.totalCount).toBe(2);
    });

    it("pages when a page is asked for, and not otherwise", async () => {
      shell.addEntities(
        Array.from({ length: 5 }, (_, index) =>
          newsletter(`nl-${index}`, `Issue ${index}`, "draft", {
            created: `2025-01-0${index + 1}T00:00:00.000Z`,
          }),
        ),
      );

      const paged = await list({ page: 1, pageSize: 2 });
      expect(paged.newsletters).toHaveLength(2);
      expect(paged.pagination).toMatchObject({
        currentPage: 1,
        totalPages: 3,
        totalItems: 5,
      });

      const plain = await list();
      expect(plain.pagination).toBeNull();
    });
  });

  describe("detail", () => {
    it("reads one newsletter by id with the body stripped of its header", async () => {
      shell.addEntities([
        newsletter("nl-1", "Weekly", "published", {
          content: "---\nsubject: Weekly\nstatus: published\n---\n\nHello",
          sentAt: "2025-01-02T10:00:00.000Z",
        }),
      ]);

      const result = await detail("nl-1");

      expect(result).toMatchObject({
        id: "nl-1",
        subject: "Weekly",
        status: "published",
        content: "Hello",
        sentAt: "2025-01-02T10:00:00.000Z",
      });
    });

    it("normalizes absent draft fields to JSON nulls", async () => {
      shell.addEntities([newsletter("nl-1", "Draft", "draft")]);

      const result = await detail("nl-1");

      expect(result.sentAt).toBeNull();
      expect(result.scheduledFor).toBeNull();
      expect(result.sourceEntities).toBeNull();
      expect(result.prevNewsletter).toBeNull();
      expect(result.nextNewsletter).toBeNull();
    });

    it("throws when the newsletter is not there", async () => {
      const failure = await detail("missing").catch((error: unknown) => error);

      expect(String(failure)).toContain("missing");
    });

    it("links to the newer and older issues around it", async () => {
      shell.addEntities([
        newsletter("nl-1", "Oldest", "published", {
          created: "2025-01-01T00:00:00.000Z",
        }),
        newsletter("nl-2", "Middle", "published", {
          created: "2025-01-02T00:00:00.000Z",
        }),
        newsletter("nl-3", "Newest", "published", {
          created: "2025-01-03T00:00:00.000Z",
        }),
      ]);

      const middle = await detail("nl-2");
      expect(middle.prevNewsletter).toEqual({
        id: "nl-3",
        subject: "Newest",
        url: "/newsletters/nl-3",
      });
      expect(middle.nextNewsletter).toEqual({
        id: "nl-1",
        subject: "Oldest",
        url: "/newsletters/nl-1",
      });

      const newest = await detail("nl-3");
      expect(newest.prevNewsletter).toBeNull();
      expect(newest.nextNewsletter?.id).toBe("nl-2");

      const oldest = await detail("nl-1");
      expect(oldest.prevNewsletter?.id).toBe("nl-2");
      expect(oldest.nextNewsletter).toBeNull();
    });

    describe("source entities", () => {
      const post = (
        id: string,
        title: string,
        slug: string,
      ): ReturnType<typeof createTestEntity> =>
        createTestEntity("post", {
          id,
          content: `# ${title}`,
          metadata: { title, slug, status: "published" },
        });

      it("resolves the posts the issue was written from", async () => {
        shell.addEntities([
          post("post-1", "First Post", "first-post"),
          post("post-2", "Second Post", "second-post"),
          newsletter("nl-1", "Digest", "published", {
            entityIds: ["post-1", "post-2"],
          }),
        ]);

        const result = await detail("nl-1");

        expect(result.sourceEntities).toEqual([
          { id: "post-1", title: "First Post", url: "/posts/first-post" },
          { id: "post-2", title: "Second Post", url: "/posts/second-post" },
        ]);
      });

      it("reads the declared source type, defaulting to posts", async () => {
        shell.addEntities([
          createTestEntity("deck", {
            id: "deck-1",
            content: "deck",
            metadata: { title: "A Deck", slug: "a-deck" },
          }),
          newsletter("nl-1", "Deck digest", "draft", {
            entityIds: ["deck-1"],
            sourceEntityType: "deck",
          }),
        ]);

        const result = await detail("nl-1");

        expect(result.sourceEntities).toEqual([
          { id: "deck-1", title: "A Deck", url: "/decks/a-deck" },
        ]);
      });

      it("leaves out sources that no longer exist", async () => {
        shell.addEntities([
          post("post-1", "Still here", "still-here"),
          newsletter("nl-1", "Digest", "draft", {
            entityIds: ["post-1", "gone"],
          }),
        ]);

        const result = await detail("nl-1");

        expect(result.sourceEntities).toEqual([
          { id: "post-1", title: "Still here", url: "/posts/still-here" },
        ]);
      });
    });
  });

  it("refuses a status it does not know", async () => {
    const failure = await list({ status: "bogus" }).catch(
      (error: unknown) => error,
    );

    expect(failure).toBeInstanceOf(z.ZodError);
  });
});
