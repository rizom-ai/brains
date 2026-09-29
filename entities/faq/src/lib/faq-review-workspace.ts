import {
  defineEntityCatalog,
  defineStudioWorkspace,
  defineWorkspaceAction,
  permissionToVisibilityScope,
  registerBuiltInStudioWorkspace,
  type ContentVisibility,
  type EntityPluginContext,
  type OperatorViewBlock,
} from "@brains/plugins";
import { z } from "@brains/utils/zod";
import { faqAdapter, faqMetadata } from "../adapters/faq-adapter";
import {
  faqCandidateAnswerSchema,
  faqSchema,
  type FaqEntity,
  type FaqFrontmatter,
} from "../schemas/faq";

const successSchema = z.object({ success: z.literal(true) });

const useAnswerAction = defineWorkspaceAction({
  name: "use-answer",
  label: "Use this answer",
  permission: "trusted",
  input: z.object({
    entityId: z.string().min(1).max(500),
    messageId: z.string().min(1).max(200),
  }),
  output: successSchema,
});

const keepAnswerAction = defineWorkspaceAction({
  name: "keep-answer",
  label: "Keep current answer",
  permission: "trusted",
  input: z.object({ entityId: z.string().min(1).max(500) }),
  output: successSchema,
});

const faqEntities = defineEntityCatalog({ id: "faq-entities", label: "FAQs" });

const reviewDataSchema = z.object({
  faqs: z.array(
    z.object({
      id: z.string(),
      question: z.string(),
      answer: z.string(),
      asked: z.number().int(),
      candidates: z.array(faqCandidateAnswerSchema),
    }),
  ),
});

type ReviewData = z.output<typeof reviewDataSchema>;

const reviewWorkspace = defineStudioWorkspace({
  id: "faq-review",
  label: "FAQ review",
  priority: 60,
  permission: "trusted",
  entityCatalog: faqEntities,
  data: reviewDataSchema,
  actions: [useAnswerAction, keepAnswerAction],
  view: ({ data }) => {
    type ReviewBlock = OperatorViewBlock<
      typeof useAnswerAction | typeof keepAnswerAction
    >;
    const blocks: ReviewBlock[] =
      data.faqs.length === 0
        ? [
            {
              type: "notice",
              id: "faq-review-at-rest",
              title: "No answers to choose between",
              text: "When a repeated question brings a different answer, it appears here.",
            },
          ]
        : [
            {
              type: "list",
              id: "faq-alternatives",
              empty: "No answers to choose between.",
              items: data.faqs.map((faq) => ({
                id: `faq-${faq.id}`,
                title: faq.question,
                description: faq.answer,
                metadata: [
                  `Asked ${faq.asked} ${faq.asked === 1 ? "time" : "times"}`,
                  ...faq.candidates.map(
                    (candidate, index) =>
                      `Alternative ${index + 1}: ${candidate.answer}`,
                  ),
                ],
                link: { catalog: faqEntities, entityType: "faq", id: faq.id },
                actionsLabel: "Answer options",
                actions: [
                  ...faq.candidates.map((candidate, index) => ({
                    action: useAnswerAction,
                    label: `Use alternative ${index + 1}`,
                    input: { entityId: faq.id, messageId: candidate.messageId },
                  })),
                  { action: keepAnswerAction, input: { entityId: faq.id } },
                ],
              })),
            },
          ];
    return {
      kicker: "FAQ",
      title: "FAQ review",
      status: {
        label: `${data.faqs.length} to review`,
        tone: data.faqs.length > 0 ? "warn" : "neutral",
      },
      blocks,
    };
  },
});

async function loadReview(
  context: EntityPluginContext,
  visibilityScope: ContentVisibility,
): Promise<ReviewData> {
  const faqs = await context.entityService.listEntities(
    { entityType: "faq", options: { filter: { visibilityScope } } },
    faqSchema,
  );
  return {
    faqs: faqs.flatMap((faq) => {
      const { frontmatter, answer } = faqAdapter.parseFaqContent(faq.content);
      return frontmatter.candidateAnswers.length === 0
        ? []
        : [
            {
              id: faq.id,
              question: frontmatter.question,
              answer,
              asked: faq.metadata.asked,
              candidates: frontmatter.candidateAnswers,
            },
          ];
    }),
  };
}

/**
 * Settle a FAQ's answer: the chosen alternative, or the current answer when
 * `messageId` is absent. Clears the alternatives. Reads at the caller's
 * visibility and writes only over the version it read.
 */
async function settleAnswer(
  context: EntityPluginContext,
  visibilityScope: ContentVisibility,
  input: { entityId: string; messageId?: string },
): Promise<{ success: true }> {
  const faq: FaqEntity | null = await context.entityService.getEntity(
    { entityType: "faq", id: input.entityId, visibilityScope },
    faqSchema,
  );
  if (!faq) throw new Error("FAQ not found");

  const { frontmatter, answer } = faqAdapter.parseFaqContent(faq.content);
  const chosen = input.messageId
    ? frontmatter.candidateAnswers.find(
        (candidate) => candidate.messageId === input.messageId,
      )?.answer
    : answer;
  if (chosen === undefined) throw new Error("Alternative answer not found");

  const settled: FaqFrontmatter = { ...frontmatter, candidateAnswers: [] };
  const result = await context.entityService.updateEntity({
    entity: {
      ...faq,
      content: faqAdapter.createFaqContent(settled, chosen),
      metadata: faqMetadata(settled),
    },
    options: { expectedContentHash: faq.contentHash },
  });
  if (result.skipReason === "content-conflict") {
    throw new Error("The FAQ changed meanwhile; reload and choose again");
  }
  return { success: true };
}

/** Register FAQ review when Studio is present; absence is a no-op. */
export async function registerFaqReviewWorkspace(
  context: EntityPluginContext,
): Promise<string | undefined> {
  const result = await registerBuiltInStudioWorkspace({
    context,
    definition: reviewWorkspace,
    bind: (bindingContext) =>
      reviewWorkspace.bind(bindingContext, {
        authorize: ({ caller }) => caller !== null,
        listEntityTypes: () => ["faq"],
        load: ({ caller }) => {
          if (!caller) throw new Error("FAQ review requires authentication");
          return loadReview(
            context,
            permissionToVisibilityScope(caller.permission),
          );
        },
        actions: [
          useAnswerAction.bind(bindingContext, ({ input, caller }) => {
            if (!caller) throw new Error("FAQ review requires authentication");
            return settleAnswer(
              context,
              permissionToVisibilityScope(caller.permission),
              input,
            );
          }),
          keepAnswerAction.bind(bindingContext, ({ input, caller }) => {
            if (!caller) throw new Error("FAQ review requires authentication");
            return settleAnswer(
              context,
              permissionToVisibilityScope(caller.permission),
              input,
            );
          }),
        ],
      }),
  });
  return result === false ? undefined : result.workspaceUrl;
}
