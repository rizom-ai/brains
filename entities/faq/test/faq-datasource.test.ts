import { beforeEach, describe, expect, it } from "bun:test";
import { randomUUID } from "node:crypto";
import type { ContentVisibility, EntityPluginContext } from "@brains/plugins";
import { createPluginHarness } from "@brains/plugins/test";
import { createSilentLogger } from "@brains/test-utils";
import {
  FaqDataSource,
  FaqPlugin,
  faqAdapter,
  faqMetadata,
  faqSectionSchema,
  type FaqFrontmatter,
  type FaqStatus,
} from "../src";

describe("FaqDataSource", () => {
  let context: EntityPluginContext;

  async function seed(
    id: string,
    status: FaqStatus,
    visibility: ContentVisibility,
    asked: number,
  ): Promise<void> {
    const frontmatter: FaqFrontmatter = {
      question: `Question ${id}?`,
      status,
      asked,
    };
    await context.entityService.createEntity({
      entity: {
        id,
        entityType: "faq",
        content: faqAdapter.createFaqContent(frontmatter, `Answer **${id}**.`),
        visibility,
        metadata: faqMetadata(frontmatter),
      },
    });
  }

  beforeEach(async () => {
    const harness = createPluginHarness({
      dataDir: `/tmp/test-faq-datasource-${randomUUID()}`,
    });
    await harness.installPlugin(new FaqPlugin());
    context = harness.getEntityContext("faq");
    await seed("once", "published", "public", 1);
    await seed("thrice", "published", "public", 3);
    await seed("draft", "draft", "public", 2);
    await seed("private", "published", "restricted", 4);
  });

  function fetch(publishedOnly: boolean): Promise<unknown> {
    return new FaqDataSource(createSilentLogger()).fetch(
      { query: {} },
      faqSectionSchema,
      { entityService: context.entityService, publishedOnly },
    );
  }

  it("lists only public FAQs, most asked first, as question and answer", async () => {
    expect(await fetch(false)).toEqual({
      faqs: [
        {
          id: "thrice",
          question: "Question thrice?",
          answer: "Answer **thrice**.",
          asked: 3,
        },
        {
          id: "draft",
          question: "Question draft?",
          answer: "Answer **draft**.",
          asked: 2,
        },
        {
          id: "once",
          question: "Question once?",
          answer: "Answer **once**.",
          asked: 1,
        },
      ],
    });
  });

  it("shows only published FAQs to a published-only build", async () => {
    const section = faqSectionSchema.parse(await fetch(true));

    expect(section.faqs.map((faq) => faq.id)).toEqual(["thrice", "once"]);
  });

  it("serves only the answer, never the alternative answers below it", async () => {
    await context.entityService.createEntity({
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
});
