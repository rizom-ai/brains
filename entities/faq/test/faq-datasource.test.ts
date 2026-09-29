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
    mergedMessageIds: string[],
  ): Promise<void> {
    const frontmatter: FaqFrontmatter = {
      question: `Question ${id}?`,
      status,
      sourceConversationId: "conv-1",
      sourceMessageId: id,
      mergedMessageIds,
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
    await seed("once", "published", "public", []);
    await seed("thrice", "published", "public", ["m1", "m2"]);
    await seed("draft", "draft", "public", ["m3"]);
    await seed("private", "published", "restricted", ["m4", "m5", "m6"]);
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
});
