import {
  defineDataSource,
  type DataSourceDefinition,
  type EntityQueryReader,
  z,
} from "@brains/sdk/entities";
import { parseFaqContent } from "../lib/faq-content";
import { faqSchema, type FaqSource } from "../schemas/faq";

/** Local declaration id; the host qualifies it for the installed package. */
export const FAQ_DATASOURCE_ID = "entities" as const;

type FaqItemSourceSchema = z.ZodObject<{
  id: z.ZodString;
  title: z.ZodString;
  url: z.ZodNullable<z.ZodString>;
  excerpt: z.ZodNullable<z.ZodString>;
  brain: z.ZodNullable<
    z.ZodObject<{ name: z.ZodString; url: z.ZodNullable<z.ZodString> }>
  >;
}>;
/** JSON presentation uses null, never undefined or persistence metadata. */
export const faqItemSourceSchema: FaqItemSourceSchema = z.object({
  id: z.string(),
  title: z.string(),
  url: z.string().nullable(),
  excerpt: z.string().nullable(),
  brain: z.object({ name: z.string(), url: z.string().nullable() }).nullable(),
});
export type FaqItemSource = z.output<typeof faqItemSourceSchema>;
function itemSource(source: FaqSource): FaqItemSource {
  return {
    id: source.id,
    title: source.title,
    url: source.url ?? null,
    excerpt: source.excerpt ?? null,
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
  sources: z.array(faqItemSourceSchema),
});
export type FaqItem = z.output<typeof faqItemSchema>;
export const faqSectionSchema: z.ZodObject<{
  faqs: z.ZodArray<FaqItemSchema>;
}> = z.object({ faqs: z.array(faqItemSchema) });
export type FaqSectionData = z.output<typeof faqSectionSchema>;

const querySchema = z.object({
  query: z
    .object({ limit: z.number().int().positive().max(1000).default(100) })
    .default({ limit: 100 }),
});

/** Public FAQ presentation never includes shared/restricted content or alternatives. */
export async function loadPublicFaqs(
  entities: Pick<EntityQueryReader, "getEntityTypes" | "listEntities">,
  limit: number,
  context: { readonly publishedOnly?: boolean | undefined },
): Promise<FaqItem[]> {
  const boundedLimit = querySchema.shape.query.parse({ limit }).limit;
  if (!entities.getEntityTypes().includes("faq")) return [];
  const faqs = await entities.listEntities(
    {
      entityType: "faq",
      options: {
        limit: boundedLimit,
        sortFields: [
          { field: "rank", direction: "asc", nullsLast: true },
          { field: "asked", direction: "desc" },
          { field: "created", direction: "desc" },
        ],
        filter: { visibility: "public", visibilityScope: "public" },
        ...(context.publishedOnly && { publishedOnly: true }),
      },
    },
    faqSchema,
  );
  return faqs.map((entity) => ({
    id: entity.id,
    question: entity.metadata.question,
    answer: parseFaqContent(entity.content).answer,
    asked: entity.metadata.asked,
    sources: (parseFaqContent(entity.content).frontmatter.sources ?? []).map(
      itemSource,
    ),
  }));
}

export const faqDataSource: DataSourceDefinition = defineDataSource({
  id: FAQ_DATASOURCE_ID,
  name: "FAQ Entity DataSource",
  description: "Fetches public FAQs for the FAQ section",
  async fetch(query, entities, context): Promise<FaqSectionData> {
    const params = querySchema.parse(query);
    return {
      faqs: await loadPublicFaqs(entities, params.query.limit, context),
    };
  },
});
