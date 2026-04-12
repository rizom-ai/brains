import { z } from "@brains/utils";

export const ProofContentSchema = z.object({
  kicker: z.string(),
  headline: z.string(),
  quote: z.string(),
  attribution: z.string(),
  partnersLabel: z.string(),
  partners: z.array(z.string()).min(1),
});

export type ProofContent = z.infer<typeof ProofContentSchema>;
