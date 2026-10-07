import type { IEntityAINamespace } from "@brains/sdk/entities";
import {
  faqClassificationSchema,
  type FaqClassification,
} from "../schemas/capture";

/** One structured AI call: is the exchange reusable, and its standalone form. */
export async function classifyExchange(
  ai: Pick<IEntityAINamespace, "generateObject">,
  question: string,
  answer: string,
): Promise<FaqClassification> {
  const prompt = [
    "Decide whether this chat exchange belongs in a FAQ.",
    "Accept only a question other people could plausibly ask, with an answer that stands on its own.",
    "Questions about this brain or its owner's public work (what do you write about, what do you offer, how do I reach you) are reusable: visitors ask them.",
    "Reject greetings, small talk, confirmations, requests to perform an action, and answers that only concern the asker's own private situation or this conversation.",
    "Reject answers that do not answer: the assistant could not find the information, had no data, was not ready, hit an error, or asked for clarification. The question may be reusable; such an answer is not.",
    "When accepting, rewrite the question and the answer so they read without the conversation. Do not add facts that are not in the answer.",
    "",
    "Question:",
    question,
    "",
    "Answer:",
    answer,
  ].join("\n");
  const { object } = await ai.generateObject(prompt, faqClassificationSchema);
  return object;
}
