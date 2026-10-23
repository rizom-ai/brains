import { z } from "@brains/utils/zod";

type ChannelActionItemExtractionSchema = z.ZodObject<{
  items: z.ZodArray<
    z.ZodObject<{
      title: z.ZodString;
      text: z.ZodString;
      message: z.ZodNumber;
      owner: z.ZodString;
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
      }),
    ),
  });

export type ChannelActionItemExtraction = z.output<
  typeof channelActionItemExtractionSchema
>;
