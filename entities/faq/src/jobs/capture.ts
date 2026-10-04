import { defineJob, type ServiceJobDefinition } from "@brains/sdk/services";
import {
  faqCaptureJobSchema,
  faqCaptureResultSchema,
} from "../schemas/capture";
import {
  captureOwnedFaq,
  type OwnedFaqCaptureWork,
} from "../lib/owned-capture";
import { classifyExchange } from "../lib/faq-classification";
import { findSameFaq } from "../lib/faq-matching";

export const faqCaptureJob: ServiceJobDefinition<
  "faq-capture",
  typeof faqCaptureJobSchema,
  typeof faqCaptureResultSchema
> = defineJob({
  name: "faq-capture",
  input: faqCaptureJobSchema,
  output: faqCaptureResultSchema,
});

export interface FaqCaptureJobDependencies {
  readonly wasClaimed: OwnedFaqCaptureWork["wasClaimed"];
  readonly sameQuestionDistance: number;
}

/** No native context, registration object, storage handle or completion namespace. */
export function handleFaqCapture(
  deps: FaqCaptureJobDependencies,
): ReturnType<typeof faqCaptureJob.handle> {
  return faqCaptureJob.handle(async (context) =>
    captureOwnedFaq(context.input, {
      mutations: context.entities.mutations,
      wasClaimed: deps.wasClaimed,
      messages: (id, range) => context.conversations.getMessages(id, { range }),
      classify: (question, answer) =>
        classifyExchange(context.ai, question, answer),
      findSame: (request) =>
        findSameFaq(
          {
            nearest: context.entities.nearest,
            ai: context.ai,
            sameQuestionDistance: deps.sameQuestionDistance,
          },
          request,
        ),
    }),
  );
}
