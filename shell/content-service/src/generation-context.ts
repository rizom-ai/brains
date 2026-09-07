import { z } from "@brains/utils/zod";

/** Context shared by immediate and durable template-based generation. */
export const generationContextSchema: z.ZodObject<{
  prompt: z.ZodOptional<z.ZodString>;
  conversationHistory: z.ZodOptional<z.ZodString>;
  data: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
  representedIdentity: z.ZodOptional<
    z.ZodEnum<{ brain: "brain"; anchor: "anchor"; none: "none" }>
  >;
  styleGuide: z.ZodOptional<
    z.ZodObject<{
      voice: z.ZodOptional<z.ZodString>;
      visual: z.ZodOptional<z.ZodString>;
    }>
  >;
}> = z.object({
  prompt: z.string().optional(),
  conversationHistory: z.string().optional(),
  data: z.record(z.string(), z.unknown()).optional(),
  representedIdentity: z.enum(["brain", "anchor", "none"]).optional(),
  styleGuide: z
    .object({
      voice: z.string().optional(),
      visual: z.string().optional(),
    })
    .optional(),
});

export type GenerationContext = z.output<typeof generationContextSchema>;
