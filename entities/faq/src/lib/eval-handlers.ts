import type { EntityPluginContext } from "@brains/plugins";
import { waitForEmbeddingsToDrain } from "@brains/plugins";
import { z } from "@brains/utils/zod";
import { faqAdapter, faqMetadata } from "../adapters/faq-adapter";
import { classifyExchange } from "../handlers/faq-capture-handler";
import { findSameFaq } from "./faq-store";
import type { FaqFrontmatter } from "../schemas/faq";

const exchangeSchema = z.object({
  question: z.string(),
  answer: z.string(),
});

const sameQuestionInputSchema = z.object({
  stored: exchangeSchema,
  incoming: exchangeSchema,
});

const EVAL_STORED_ID = "eval-stored-faq";

/** The markdown a captured FAQ is stored and embedded as. */
function faqMarkdown(exchange: z.output<typeof exchangeSchema>): {
  frontmatter: FaqFrontmatter;
  content: string;
} {
  const frontmatter: FaqFrontmatter = {
    question: exchange.question,
    status: "draft",
    asked: 1,
  };
  return {
    frontmatter,
    content: faqAdapter.createFaqContent(frontmatter, exchange.answer),
  };
}

async function clearFaqs(context: EntityPluginContext): Promise<void> {
  const faqs = await context.entityService.listEntities({
    entityType: "faq",
    options: { filter: { visibilityScope: "restricted" } },
  });
  await Promise.all(
    faqs.map((faq) =>
      context.entityService.deleteEntity({ entityType: "faq", id: faq.id }),
    ),
  );
}

/**
 * Eval hooks for the two model-dependent steps: the classifier's judgement,
 * and the embedding distance that decides whether two FAQs ask the same
 * question. Unit tests fake both; these run them against the real models.
 */
export function registerFaqEvalHandlers(params: {
  context: EntityPluginContext;
  sameQuestionDistance: number;
}): void {
  const { context, sameQuestionDistance } = params;

  context.eval.registerHandler("classifyExchange", async (input: unknown) => {
    const exchange = exchangeSchema.parse(input);
    return classifyExchange(context.ai, exchange.question, exchange.answer);
  });

  context.eval.registerHandler("sameQuestion", async (input: unknown) => {
    const { stored, incoming } = sameQuestionInputSchema.parse(input);
    await clearFaqs(context);

    const seeded = faqMarkdown(stored);
    await context.entityService.createEntity({
      entity: {
        id: EVAL_STORED_ID,
        entityType: "faq",
        content: seeded.content,
        visibility: "restricted",
        metadata: faqMetadata(seeded.frontmatter),
      },
    });
    await waitForEmbeddingsToDrain(context.jobs);

    const query = faqMarkdown(incoming).content;
    const distances = await context.entityService.searchWithDistances({
      query,
    });
    const distance = distances.find(
      (result) => result.entityId === EVAL_STORED_ID,
    )?.distance;
    if (distance === undefined) {
      throw new Error("The stored FAQ was not embedded");
    }
    // The full production decision: distance shortlist, then the check.
    const match = await findSameFaq(
      {
        entityService: context.entityService,
        searchWithDistances: async (): Promise<typeof distances> => distances,
        sameQuestionDistance,
        ai: context.ai,
      },
      { content: query, visibility: "restricted" },
    );
    return {
      distance,
      shortlisted: distance <= sameQuestionDistance,
      sameQuestion: match?.id === EVAL_STORED_ID,
    };
  });
}
