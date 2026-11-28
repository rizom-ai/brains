import { z } from "@brains/utils/zod";

/**
 * What a candidate turned out to be. The model is asked to judge every
 * statement that might be a decision, and only `decision` is recorded: asked
 * for decisions alone, it returns the others anyway and says in their text
 * that they are not decisions.
 */
export const decisionCandidateKindSchema: z.ZodEnum<{
  decision: "decision";
  "action-item": "action-item";
  undecided: "undecided";
  recorded: "recorded";
}> = z.enum(["decision", "action-item", "undecided", "recorded"]);

type ChannelDecisionExtractionSchema = z.ZodObject<{
  language: z.ZodString;
  candidates: z.ZodArray<
    z.ZodObject<{
      kind: typeof decisionCandidateKindSchema;
      title: z.ZodString;
      text: z.ZodString;
      message: z.ZodNumber;
      decidedBy: z.ZodArray<z.ZodString>;
    }>
  >;
}>;

/** What the model returns: every field required, as models fill them all. */
export const channelDecisionExtractionSchema: ChannelDecisionExtractionSchema =
  z.object({
    /**
     * The language the new messages are written in. Asked for first, so the
     * model settles it from the messages before it writes a title or text:
     * left to itself it guesses a language from the speakers' names.
     */
    language: z.string(),
    candidates: z.array(
      z.object({
        kind: decisionCandidateKindSchema,
        title: z.string().min(1).max(200),
        text: z.string(),
        message: z.number().int(),
        /** The participants (p1, p2…) who declared or accepted it. */
        decidedBy: z.array(z.string()),
      }),
    ),
  });

export type ChannelDecisionExtraction = z.output<
  typeof channelDecisionExtractionSchema
>;
