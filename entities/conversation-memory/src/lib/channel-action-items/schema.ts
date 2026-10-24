import { z } from "@brains/utils/zod";

type ChannelActionItemExtractionSchema = z.ZodObject<{
  items: z.ZodArray<
    z.ZodObject<{
      title: z.ZodString;
      text: z.ZodString;
      message: z.ZodNumber;
      owner: z.ZodString;
      due: z.ZodString;
    }>
  >;
  updates: z.ZodArray<
    z.ZodObject<{
      card: z.ZodString;
      title: z.ZodString;
      text: z.ZodString;
      owner: z.ZodString;
      due: z.ZodString;
      message: z.ZodNumber;
    }>
  >;
  withdrawals: z.ZodArray<
    z.ZodObject<{
      card: z.ZodString;
      message: z.ZodNumber;
    }>
  >;
}>;

/** What the model returns: every field required, as models fill them all. */
export const channelActionItemExtractionSchema: ChannelActionItemExtractionSchema =
  z.object({
    items: z.array(
      z.object({
        title: z.string().min(1).max(200),
        text: z.string(),
        message: z.number().int(),
        owner: z.string().min(1),
        due: z.string().min(1),
      }),
    ),
    /** Own cards the new messages change, each restated in full. */
    updates: z.array(
      z.object({
        card: z.string().min(1),
        title: z.string().min(1).max(200),
        text: z.string(),
        owner: z.string().min(1),
        due: z.string().min(1),
        message: z.number().int(),
      }),
    ),
    /** Own cards the new messages call off or report done. */
    withdrawals: z.array(
      z.object({
        card: z.string().min(1),
        message: z.number().int(),
      }),
    ),
  });

export type ChannelActionItemExtraction = z.output<
  typeof channelActionItemExtractionSchema
>;
