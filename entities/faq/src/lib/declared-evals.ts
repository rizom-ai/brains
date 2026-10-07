import type { EntityEvalDeclaration } from "@brains/sdk/entities";
import { z } from "@brains/utils/zod";
import { faq } from "../faq-entity";
import { classifyExchange } from "./faq-classification";
import { createFaqContent, faqMetadata } from "./faq-content";
import { findSameFaq } from "./faq-matching";

const exchangeSchema = z.object({ question: z.string(), answer: z.string() });
const pairSchema = z.object({
  stored: exchangeSchema,
  incoming: exchangeSchema,
});
const STORED_ID = "eval-stored-faq";
function markdown(exchange: z.output<typeof exchangeSchema>): string {
  return createFaqContent(
    { question: exchange.question, status: "draft", asked: 1 },
    exchange.answer,
  );
}

/** Only explicit evaluation executes these models; registration is inert. */
export function faqEvalHandlers(
  sameQuestionDistance: number,
): EntityEvalDeclaration {
  return {
    classifyExchange: async (
      input,
      { ai },
    ): ReturnType<typeof classifyExchange> => {
      const exchange = exchangeSchema.parse(input);
      return classifyExchange(ai, exchange.question, exchange.answer);
    },
    sameQuestion: async (
      input,
      { fixtures, entities, ai },
    ): Promise<{
      distance: number;
      shortlisted: boolean;
      sameQuestion: boolean;
    }> => {
      const { stored, incoming } = pairSchema.parse(input);
      await fixtures.reset({ visibilityScope: "restricted" });
      await fixtures.seed({
        id: STORED_ID,
        entityType: "faq",
        content: markdown(stored),
        visibility: "restricted",
        metadata: faqMetadata({
          question: stored.question,
          status: "draft",
          asked: 1,
        }),
      });
      await fixtures.settleEmbeddings();
      const query = markdown(incoming);
      const candidates = await entities.nearest(faq, query, {
        visibility: "restricted",
        maxDistance: 2,
        limit: 1,
      });
      const distance = candidates.find(
        (candidate) => candidate.entity.id === STORED_ID,
      )?.distance;
      if (distance === undefined)
        throw new Error("The stored FAQ was not embedded");
      const match = await findSameFaq(
        { nearest: entities.nearest, ai, sameQuestionDistance },
        { content: query, visibility: "restricted" },
      );
      return {
        distance,
        shortlisted: distance <= sameQuestionDistance,
        sameQuestion: match?.id === STORED_ID,
      };
    },
  };
}
