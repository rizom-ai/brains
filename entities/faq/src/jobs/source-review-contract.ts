import { defineJob, z, type ServiceJobDefinition } from "@brains/sdk/services";
const input: z.ZodObject<{ sourceId: z.ZodString; withdrawalId: z.ZodString }> =
  z.object({ sourceId: z.string().min(1), withdrawalId: z.string().min(1) });
const output: z.ZodObject<{ reviewed: z.ZodArray<z.ZodString> }> = z.object({
  reviewed: z.array(z.string()),
});
export const faqSourceReviewJob: ServiceJobDefinition<
  "faq-source-review",
  typeof input,
  typeof output
> = defineJob({ name: "faq-source-review", input, output });
