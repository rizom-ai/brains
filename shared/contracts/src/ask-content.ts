import { z } from "@brains/utils/zod";

/** Authored presentation only. Never permissions, policy, prompts or model instructions. */
export const askContentSchema: z.ZodObject<{
  title: z.ZodOptional<z.ZodString>;
  introduction: z.ZodOptional<z.ZodString>;
  topics: z.ZodOptional<z.ZodArray<z.ZodString>>;
  topicsHeading: z.ZodOptional<z.ZodString>;
  contactLabel: z.ZodOptional<z.ZodString>;
  contactNote: z.ZodOptional<z.ZodString>;
  mapCaption: z.ZodOptional<z.ZodString>;
  refusal: z.ZodOptional<z.ZodString>;
}> = z.object({
  title: z.string().trim().min(1).max(500).optional(),
  introduction: z.string().trim().min(1).max(4000).optional(),
  topics: z.array(z.string().trim().min(1).max(500)).max(20).optional(),
  // The words around the conversation on a page that presents it. Surfaces
  // leave out what the owner has not written rather than supply their own.
  topicsHeading: z.string().trim().min(1).max(120).optional(),
  contactLabel: z.string().trim().min(1).max(80).optional(),
  contactNote: z.string().trim().min(1).max(240).optional(),
  mapCaption: z.string().trim().min(1).max(160).optional(),
  // What a visitor reads when their question is outside what the site's
  // work speaks to. Without it, the answer is a neutral line.
  refusal: z.string().trim().min(1).max(500).optional(),
});
export type AskContent = z.output<typeof askContentSchema>;

export const askContentFrontmatterSchema: z.ZodObject<{
  title: z.ZodOptional<z.ZodString>;
  topics: z.ZodOptional<z.ZodArray<z.ZodString>>;
  topicsHeading: z.ZodOptional<z.ZodString>;
  contactLabel: z.ZodOptional<z.ZodString>;
  contactNote: z.ZodOptional<z.ZodString>;
  mapCaption: z.ZodOptional<z.ZodString>;
  refusal: z.ZodOptional<z.ZodString>;
}> = askContentSchema.omit({ introduction: true });
export type AskContentFrontmatter = z.output<
  typeof askContentFrontmatterSchema
>;
