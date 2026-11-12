import type {
  ServiceCorpusReads,
  ServiceDataSourceDeclaration,
} from "@brains/sdk/internal/service-runtime";
import type { Logger } from "@brains/utils/logger";
import { z } from "@brains/utils/zod";
import { readFaq } from "../lib/faq-body";
import { faqSchema, type FaqEntity, type FaqSource } from "../schemas/faq";

export const FAQ_DATASOURCE_ID = "faq:entities" as const;

type FaqItemSourceSchema = z.ZodObject<{
  id: z.ZodString;
  title: z.ZodString;
  url: z.ZodNullable<z.ZodString>;
  brain: z.ZodNullable<
    z.ZodObject<{ name: z.ZodString; url: z.ZodNullable<z.ZodString> }>
  >;
}>;

/** A kept source as a page receives it: every field present, absent as null. */
export const faqItemSourceSchema: FaqItemSourceSchema = z.object({
  id: z.string(),
  title: z.string(),
  url: z.string().nullable(),
  brain: z.object({ name: z.string(), url: z.string().nullable() }).nullable(),
});

export type FaqItemSource = z.output<typeof faqItemSourceSchema>;

function itemSource(source: FaqSource): FaqItemSource {
  return {
    id: source.id,
    title: source.title,
    url: source.url ?? null,
    brain: source.brain
      ? { name: source.brain.name, url: source.brain.url ?? null }
      : null,
  };
}

type FaqItemSchema = z.ZodObject<{
  id: z.ZodString;
  question: z.ZodString;
  answer: z.ZodString;
  asked: z.ZodNumber;
  sources: z.ZodArray<FaqItemSourceSchema>;
}>;

export const faqItemSchema: FaqItemSchema = z.object({
  id: z.string(),
  question: z.string(),
  answer: z.string(),
  asked: z.number().int(),
  /** What the answer drew on when it was first given; a page may show them. */
  sources: z.array(faqItemSourceSchema),
});

export type FaqItem = z.output<typeof faqItemSchema>;

export const faqSectionSchema: z.ZodObject<{
  faqs: z.ZodArray<FaqItemSchema>;
}> = z.object({ faqs: z.array(faqItemSchema) });

export type FaqSectionData = z.output<typeof faqSectionSchema>;

/** A FAQ as the section shows it. */
function faqItem(entity: FaqEntity): FaqItem {
  const { answer, sources } = readFaq(entity);
  return {
    id: entity.id,
    question: entity.metadata.question,
    answer,
    asked: entity.metadata.asked,
    sources: sources.map(itemSource),
  };
}

/** The page of the section a template asks for. */
const faqQuerySchema = z.looseObject({
  query: z
    .looseObject({
      limit: z.number().optional(),
      page: z.number().optional(),
      pageSize: z.number().optional(),
    })
    .optional(),
});

/** What a section is read with: the build's corpus and its publish rule. */
export interface FaqSectionBuild {
  readonly entityService: Pick<ServiceCorpusReads, "listEntities">;
  readonly publishedOnly?: boolean | undefined;
}

/**
 * Supplies the FAQ section with public FAQs: the owner's ranked ones in rank
 * order, then the rest most asked first, newest first on a tie. A FAQ drawn
 * from shared or restricted content never reaches a site, whatever the
 * build's visibility scope; drafts stay out of published-only builds.
 */
export async function fetchFaqSection(
  query: unknown,
  build: FaqSectionBuild,
): Promise<FaqSectionData> {
  const page = faqQuerySchema.parse(query).query ?? {};
  const perPage = page.pageSize ?? page.limit ?? 100;
  const entities = await build.entityService.listEntities({
    entityType: "faq",
    options: {
      limit: perPage,
      offset: ((page.page ?? 1) - 1) * perPage,
      sortFields: [
        { field: "rank", direction: "asc", nullsLast: true },
        { field: "asked", direction: "desc" },
        { field: "created", direction: "desc" },
      ],
      filter: { visibility: "public" },
      ...(build.publishedOnly === true && { publishedOnly: true }),
    },
  });
  return {
    faqs: entities.map((entity) => faqItem(faqSchema.parse(entity))),
  };
}

/** The FAQ section's source as the brain registers it: `faq:entities`. */
export const faqDataSource: ServiceDataSourceDeclaration = {
  id: "entities",
  name: "FAQ Entity DataSource",
  description: "Fetches public FAQs for the FAQ section",
  fetch: (query, { corpus, publishedOnly }) =>
    fetchFaqSection(query, { entityService: corpus, publishedOnly }),
};

/**
 * The first public FAQs in the section's order, for a site that shows them
 * beside its other content, under the build's publish rule; none where the
 * brain does not capture FAQs.
 */
export async function loadPublicFaqs(
  context: {
    readonly entityService: FaqSectionBuild["entityService"] & {
      hasEntityType(entityType: string): boolean;
    };
    readonly publishedOnly?: boolean | undefined;
  },
  limit: number,
  _logger?: Logger,
): Promise<FaqItem[]> {
  if (!context.entityService.hasEntityType("faq")) return [];
  const section = await fetchFaqSection({ query: { limit } }, context);
  return section.faqs;
}
