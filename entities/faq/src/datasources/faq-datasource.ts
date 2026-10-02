import { BaseEntityDataSource } from "@brains/plugins";
import type {
  BaseDataSourceContext,
  DataSourceSchema,
  EntityDataSourceConfig,
} from "@brains/plugins";
import type { Logger } from "@brains/utils/logger";
import { z } from "@brains/utils/zod";
import { faqAdapter } from "../adapters/faq-adapter";
import { faqSchema, type FaqEntity } from "../schemas/faq";

export const FAQ_DATASOURCE_ID = "faq:entities" as const;

type FaqItemSchema = z.ZodObject<{
  id: z.ZodString;
  question: z.ZodString;
  answer: z.ZodString;
  asked: z.ZodNumber;
}>;

export const faqItemSchema: FaqItemSchema = z.object({
  id: z.string(),
  question: z.string(),
  answer: z.string(),
  asked: z.number().int(),
});

export type FaqItem = z.output<typeof faqItemSchema>;

export const faqSectionSchema: z.ZodObject<{
  faqs: z.ZodArray<FaqItemSchema>;
}> = z.object({ faqs: z.array(faqItemSchema) });

export type FaqSectionData = z.output<typeof faqSectionSchema>;

/**
 * Supplies the FAQ section with public FAQs: the owner's ranked ones in rank
 * order, then the rest most asked first, newest first on a tie. A FAQ drawn
 * from shared or restricted content never reaches a site, whatever the
 * build's visibility scope; drafts stay out of published-only builds.
 */
export class FaqDataSource extends BaseEntityDataSource<
  FaqEntity,
  FaqItem,
  FaqSectionData
> {
  readonly id: typeof FAQ_DATASOURCE_ID = FAQ_DATASOURCE_ID;
  readonly name = "FAQ Entity DataSource";
  readonly description = "Fetches public FAQs for the FAQ section";

  protected readonly config: EntityDataSourceConfig<FaqEntity> = {
    entityType: "faq",
    entitySchema: faqSchema,
    defaultSort: [
      { field: "rank", direction: "asc", nullsLast: true },
      { field: "asked", direction: "desc" },
      { field: "created", direction: "desc" },
    ],
    defaultLimit: 100,
    lookupField: "id",
  };

  constructor(logger: Logger) {
    super(logger);
  }

  protected transformEntity(entity: FaqEntity): FaqItem {
    const { answer } = faqAdapter.parseFaqContent(entity.content);
    return {
      id: entity.id,
      question: entity.metadata.question,
      answer,
      asked: entity.metadata.asked,
    };
  }

  protected buildListResult(items: FaqItem[]): FaqSectionData {
    return { faqs: items };
  }

  override async fetch<T>(
    query: unknown,
    outputSchema: DataSourceSchema<T>,
    context: BaseDataSourceContext,
  ): Promise<T> {
    const params = this.parseQuery(query);
    const list = await this.fetchList(params.query, context.entityService, {
      filter: { visibility: "public" },
      ...(context.publishedOnly && { publishedOnly: true }),
    });
    return outputSchema.parse(this.buildListResult(list.items));
  }
}

/**
 * The first public FAQs in the section's order, for a site that shows them
 * beside its other content, under the build's publish rule; none where the
 * brain does not capture FAQs.
 */
export async function loadPublicFaqs(
  context: BaseDataSourceContext,
  limit: number,
  logger: Logger,
): Promise<FaqItem[]> {
  if (!context.entityService.hasEntityType("faq")) return [];
  const section = await new FaqDataSource(logger).fetch(
    { query: { limit } },
    faqSectionSchema,
    context,
  );
  return section.faqs;
}
