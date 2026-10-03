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
  loadPublicFaqs,
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
    { rank, created }: { rank?: number; created?: string } = {},
  ): Promise<void> {
    const frontmatter: FaqFrontmatter = {
      question: `Question ${id}?`,
      status,
      asked,
      ...(rank !== undefined && { rank }),
    };
    await context.entityService.createEntity({
      entity: {
        id,
        entityType: "faq",
        content: faqAdapter.createFaqContent(frontmatter, `Answer **${id}**.`),
        visibility,
        metadata: faqMetadata(frontmatter),
        ...(created !== undefined && { created }),
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

  it("carries the sources a FAQ kept, so a page can show whose memory answered", async () => {
    const frontmatter: FaqFrontmatter = {
      question: "How does Rizom keep memory?",
      status: "published",
      asked: 5,
      sources: [
        {
          id: "network-piece:plc-peer--post--3kabc",
          title: "Handoffs between teams",
          url: "https://becca.rizom.ai/essays/handoffs",
          excerpt: "Before anyone leaves a task we write three things down.",
          brain: { name: "Becca", url: "https://becca.rizom.ai/" },
        },
      ],
    };
    await context.entityService.createEntity({
      entity: {
        id: "sourced",
        entityType: "faq",
        content: faqAdapter.createFaqContent(frontmatter, "In their brains."),
        visibility: "public",
        metadata: faqMetadata(frontmatter),
      },
    });
    const section = faqSectionSchema.parse(await fetch(true));
    const sourced = section.faqs.find((faq) => faq.id === "sourced");
    expect(sourced?.sources).toEqual([
      {
        id: "network-piece:plc-peer--post--3kabc",
        title: "Handoffs between teams",
        url: "https://becca.rizom.ai/essays/handoffs",
        excerpt: "Before anyone leaves a task we write three things down.",
        brain: { name: "Becca", url: "https://becca.rizom.ai/" },
      },
    ]);
    expect(section.faqs.find((faq) => faq.id === "once")?.sources).toEqual([]);
  });

  // A site shows the first FAQs beside its other content.
  it("loads the first public FAQs for a site, up to a limit", async () => {
    const preview = await loadPublicFaqs(
      { entityService: context.entityService, publishedOnly: false },
      2,
      createSilentLogger(),
    );
    expect(preview.map((faq) => faq.id)).toEqual(["thrice", "draft"]);
    const production = await loadPublicFaqs(
      { entityService: context.entityService, publishedOnly: true },
      6,
      createSilentLogger(),
    );
    expect(production.map((faq) => faq.id)).toEqual(["thrice", "once"]);
  });

  it("loads none where the brain does not capture FAQs", async () => {
    const harness = createPluginHarness({
      dataDir: `/tmp/test-faq-none-${randomUUID()}`,
    });
    expect(
      await loadPublicFaqs(
        { entityService: harness.getEntityService(), publishedOnly: true },
        6,
        createSilentLogger(),
      ),
    ).toEqual([]);
  });
});
