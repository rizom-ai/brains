import { z } from "@brains/utils/zod";

type TitleSchema = z.ZodString;
type RelevanceSchema = z.ZodNumber;
type VisibilitySchema = z.ZodEnum<{
  public: "public";
  shared: "shared";
  restricted: "restricted";
}>;

const titleSchema: TitleSchema = z.string().trim().min(1);
const proposalTitleSchema: TitleSchema = titleSchema.max(40);
const relevanceSchema: RelevanceSchema = z.number().min(0).max(1);

const topicSupportVoteSchema: z.ZodObject<{
  slug: z.ZodString;
  title: TitleSchema;
  relevanceScore: RelevanceSchema;
}> = z.object({
  slug: z.string().min(1),
  title: titleSchema,
  relevanceScore: relevanceSchema,
});

const topicProposalSchema: z.ZodObject<{
  slug: z.ZodString;
  title: TitleSchema;
  relevanceScore: RelevanceSchema;
  content: z.ZodString;
}> = topicSupportVoteSchema.extend({
  title: proposalTitleSchema,
  content: z.string().min(1),
});

export const topicVoteSchema: z.ZodObject<{
  revision: z.ZodString;
  visibility: VisibilitySchema;
  supported: z.ZodArray<typeof topicSupportVoteSchema>;
  proposal: z.ZodNullable<typeof topicProposalSchema>;
}> = z.object({
  revision: z.string(),
  visibility: z.enum(["public", "shared", "restricted"]),
  supported: z.array(topicSupportVoteSchema),
  proposal: topicProposalSchema.nullable(),
});

export type TopicProposal = z.output<typeof topicProposalSchema>;
export type TopicVote = z.output<typeof topicVoteSchema>;

export const topicVoteResponseSchema: z.ZodObject<{
  sources: z.ZodArray<
    z.ZodObject<{
      sourceKey: z.ZodString;
      supported: z.ZodArray<
        z.ZodObject<{ title: TitleSchema; relevanceScore: RelevanceSchema }>
      >;
      proposal: z.ZodNullable<
        z.ZodObject<{
          title: TitleSchema;
          content: z.ZodString;
          relevanceScore: RelevanceSchema;
        }>
      >;
    }>
  >;
}> = z.object({
  sources: z.array(
    z.object({
      sourceKey: z.string().min(1),
      supported: z
        .array(
          z.object({ title: titleSchema, relevanceScore: relevanceSchema }),
        )
        .max(48),
      proposal: z
        .object({
          title: proposalTitleSchema,
          content: z.string().min(1),
          relevanceScore: relevanceSchema,
        })
        .nullable(),
    }),
  ),
});

export type TopicVoteResponse = z.output<typeof topicVoteResponseSchema>;

export const topicDescriptionResponseSchema: z.ZodObject<{
  content: z.ZodString;
}> = z.object({
  content: z.string().trim().min(1),
});

export type TopicDescriptionResponse = z.output<
  typeof topicDescriptionResponseSchema
>;
