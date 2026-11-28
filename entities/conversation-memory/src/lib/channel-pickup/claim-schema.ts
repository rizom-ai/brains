import { z } from "@brains/utils/zod";

/**
 * What a candidate turned out to be. The model is asked to judge every
 * statement that might be a decision or an insight, and only those two are
 * recorded: asked for decisions alone, it returns the others anyway and says
 * in their text that they are not decisions.
 */
export const claimCandidateKindSchema: z.ZodEnum<{
  decision: "decision";
  insight: "insight";
  guess: "guess";
  "action-item": "action-item";
  undecided: "undecided";
  recorded: "recorded";
}> = z.enum([
  "decision",
  "insight",
  "guess",
  "action-item",
  "undecided",
  "recorded",
]);

type ChannelClaimExtractionSchema = z.ZodObject<{
  language: z.ZodString;
  candidates: z.ZodArray<
    z.ZodObject<{
      kind: typeof claimCandidateKindSchema;
      title: z.ZodString;
      text: z.ZodString;
      message: z.ZodNumber;
      decidedBy: z.ZodArray<z.ZodString>;
      replaces: z.ZodString;
    }>
  >;
}>;

/** What the model returns: every field required, as models fill them all. */
export const channelClaimExtractionSchema: ChannelClaimExtractionSchema =
  z.object({
    /**
     * The language the new messages are written in. Asked for first, so the
     * model settles it from the messages before it writes a title or text:
     * left to itself it guesses a language from the speakers' names.
     */
    language: z.string(),
    candidates: z.array(
      z.object({
        kind: claimCandidateKindSchema,
        title: z.string().min(1).max(200),
        text: z.string(),
        message: z.number().int(),
        /** The participants (p1, p2…) who declared or accepted it. */
        decidedBy: z.array(z.string()),
        /** The recorded decision (d1, d2…) it overturns, or "none". */
        replaces: z.string(),
      }),
    ),
  });

export type ChannelClaimExtraction = z.output<
  typeof channelClaimExtractionSchema
>;
