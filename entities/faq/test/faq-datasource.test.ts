import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { createTestDirectory } from "@brains/test-utils";
import { scopeEntityReads } from "@brains/entity-service";
import { z } from "@brains/sdk/entities";
import { openFoldStorage } from "./helpers/fold-storage";
import { randomUUID } from "node:crypto";
import {
  type ContentVisibility,
  type EntityServiceClient,
  createDeclarativeDataSource,
} from "@brains/plugins";
import * as faqAdapter from "../src/lib/faq-content";
import { faqEntityHarness } from "./helpers/faq-entity-harness";
import { createPluginHarness } from "@brains/plugins/test";
import {
  faqDataSource,
  faqMetadata,
  faqSectionSchema,
  loadPublicFaqs,
  type FaqFrontmatter,
  type FaqStatus,
} from "../src";

describe.each(["mock", "sqlite"] as const)(
  "declarative FAQ source (%s)",
  (storage) => {
    let entities: EntityServiceClient;
    let cleanup: (() => Promise<void>) | undefined;
    afterEach(async () => {
      await cleanup?.();
      cleanup = undefined;
    });

    async function seed(
      id: string,
      status: FaqStatus,
      visibility: ContentVisibility,
      asked: number,
      { rank, created }: { rank?: number; created?: string } = {},
    ): Promise<void> {
      const frontmatter: FaqFrontmatter = {
        question: `Question ${id}?`,
        status,
        asked,
        ...(rank !== undefined && { rank }),
      };
      await entities.createEntity({
        entity: {
          id,
          entityType: "faq",
          content: faqAdapter.createFaqContent(
            frontmatter,
            `Answer **${id}**.`,
          ),
          visibility,
          metadata: faqMetadata(frontmatter),
          ...(created !== undefined && { created }),
        },
      });
    }

    beforeEach(async () => {
      if (storage === "sqlite") {
        const directory = await createTestDirectory("faq-datasource");
        const service = await openFoldStorage(directory.dir);
        cleanup = async (): Promise<void> => {
          service.close();
          await directory.cleanup();
        };
        await service.initialize();
        entities = service;
      } else {
        entities = (await faqEntityHarness()).getEntityService();
      }
      await seed("once", "published", "public", 1);
      await seed("thrice", "published", "public", 3);
      await seed("draft", "draft", "public", 2);
      await seed("private", "published", "restricted", 4);
      await seed("shared", "published", "shared", 20, { rank: 1 });
    });

    function fetch(publishedOnly: boolean): Promise<unknown> {
      return createDeclarativeDataSource(
        faqDataSource,
        "@brains/faq:entities",
      ).fetch({ query: {} }, faqSectionSchema, {
        entityService: entities,
        publishedOnly,
      });
    }

    it("lists only public FAQs, unranked ones most asked first, as question and answer", async () => {
      expect(await fetch(false)).toEqual({
        faqs: [
          {
            id: "thrice",
            question: "Question thrice?",
            answer: "Answer **thrice**.",
            asked: 3,
            sources: [],
          },
          {
            id: "draft",
            question: "Question draft?",
            answer: "Answer **draft**.",
            asked: 2,
            sources: [],
          },
          {
            id: "once",
            question: "Question once?",
            answer: "Answer **once**.",
            asked: 1,
            sources: [],
          },
        ],
      });
    });

    it("puts the owner's ranked FAQs first, in rank order", async () => {
      await seed("second", "published", "public", 1, { rank: 2 });
      await seed("first", "published", "public", 1, { rank: 1 });

      const section = faqSectionSchema.parse(await fetch(true));

      expect(section.faqs.map((faq) => faq.id)).toEqual([
        "first",
        "second",
        "thrice",
        "once",
      ]);
    });

    it("orders unranked FAQs asked equally newest first", async () => {
      // Alphabetically after "once", but asked since.
      await seed("zeta", "published", "public", 1, {
        created: new Date(Date.now() + 60_000).toISOString(),
      });

      const section = faqSectionSchema.parse(await fetch(true));

      expect(section.faqs.map((faq) => faq.id)).toEqual([
        "thrice",
        "zeta",
        "once",
      ]);
    });

    it("shows only published FAQs to a published-only build", async () => {
      const section = faqSectionSchema.parse(await fetch(true));

      expect(section.faqs.map((faq) => faq.id)).toEqual(["thrice", "once"]);
    });

    it("cannot widen a published reader through preview metadata or query fields", async () => {
      const source = createDeclarativeDataSource(
        faqDataSource,
        "@brains/faq:entities",
      );
      const section = await source.fetch(
        { query: { visibility: "restricted", publishedOnly: false } },
        faqSectionSchema,
        {
          entityService: scopeEntityReads(entities, {
            visibilityScope: "public",
            publishedOnly: true,
          }),
          publishedOnly: false,
        },
      );
      expect(section.faqs.map((faq) => faq.id)).toEqual(["thrice", "once"]);
    });

    it("serves only the answer, never the alternative answers below it", async () => {
      await entities.createEntity({
        entity: {
          id: "with-alternatives",
          entityType: "faq",
          content: faqAdapter.createFaqContent(
            {
              question: "Question with alternatives?",
              status: "published",
              asked: 9,
            },
            "The chosen answer.",
            [{ answer: "An unreviewed alternative." }],
          ),
          visibility: "public",
          metadata: {
            question: "Question with alternatives?",
            status: "published",
            asked: 9,
          },
        },
      });

      const section = faqSectionSchema.parse(await fetch(true));

      expect(section.faqs[0]).toMatchObject({
        id: "with-alternatives",
        answer: "The chosen answer.",
      });
      expect(JSON.stringify(section)).not.toContain("unreviewed alternative");
    });

    // A site shows the first FAQs beside its other content.
    it("loads the first public FAQs for a site, up to a limit", async () => {
      const preview = await loadPublicFaqs(entities, 2, {
        publishedOnly: false,
      });
      expect(preview.map((faq) => faq.id)).toEqual(["thrice", "draft"]);
      const production = await loadPublicFaqs(entities, 6, {
        publishedOnly: true,
      });
      expect(production.map((faq) => faq.id)).toEqual(["thrice", "once"]);
    });

    it.each([0, -1, 1001, 1.5, Number.NaN])(
      "rejects an invalid list bound (%s)",
      async (limit) => {
        const error = await loadPublicFaqs(entities, limit, {}).catch(
          (cause: unknown): unknown => cause,
        );
        expect(error).toBeInstanceOf(z.ZodError);
      },
    );

    it("loads none where the brain does not capture FAQs", async () => {
      const harness = createPluginHarness({
        dataDir: `/tmp/test-faq-none-${randomUUID()}`,
      });
      expect(
        await loadPublicFaqs(harness.getEntityService(), 6, {
          publishedOnly: true,
        }),
      ).toEqual([]);
    });
  },
);
