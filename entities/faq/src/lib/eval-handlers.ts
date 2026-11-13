import {
  internalFullScope,
  waitForEmbeddingsToDrain,
  type ServiceRuntime,
} from "@brains/sdk/internal/service-runtime";
import { z } from "@brains/utils/zod";
import { faqDocument, faqRecord } from "./faq-body";
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

/** A captured FAQ's fields, as capture drafts them. */
function draftOf(exchange: z.output<typeof exchangeSchema>): FaqFrontmatter {
  return { question: exchange.question, status: "draft", asked: 1 };
}

/** What a FAQ eval reaches: the package's reads, writes, AI and jobs. */
type FaqEvalRuntime = Pick<
  ServiceRuntime,
  "entityReads" | "entityWrites" | "ai" | "jobs" | "evalHandler"
>;

async function clearFaqs(context: FaqEvalRuntime): Promise<void> {
  const faqs = await context.entityReads.listEntities({
    entityType: "faq",
    options: {
      filter: {
        visibilityScope: internalFullScope("eval harness clears faqs"),
      },
    },
  });
  await Promise.all(
    faqs.map((faq) =>
      context.entityWrites.deleteEntity({ entityType: "faq", id: faq.id }),
    ),
  );
}

/**
 * Eval hooks for the two model-dependent steps: the classifier's judgement,
 * and the embedding distance that decides whether two FAQs ask the same
 * question. Unit tests fake both; these run them against the real models.
 */
export function registerFaqEvalHandlers(params: {
  context: FaqEvalRuntime;
  sameQuestionDistance: number;
}): void {
  const { context, sameQuestionDistance } = params;

  context.evalHandler("classifyExchange", async (input: unknown) => {
    const exchange = exchangeSchema.parse(input);
    return classifyExchange(context.ai, exchange.question, exchange.answer);
  });

  context.evalHandler("sameQuestion", async (input: unknown) => {
    const { stored, incoming } = sameQuestionInputSchema.parse(input);
    await clearFaqs(context);

    await context.entityWrites.createEntity({
      entity: {
        id: EVAL_STORED_ID,
        entityType: "faq",
        ...faqRecord(draftOf(stored), stored.answer),
        visibility: "restricted",
      },
    });
    await waitForEmbeddingsToDrain(context.jobs);

    const query = faqDocument(draftOf(incoming), incoming.answer);
    const distances = await context.entityReads.searchWithDistances({
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
        entityService: {
          getEntity: context.entityReads.getEntity,
          updateEntity: context.entityWrites.updateEntity,
        },
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
