import { z } from "zod";

export const FeaturesLayoutSchema = z.object({
  headline: z.string(),
  subheadline: z.string().optional(),
  features: z.array(
    z.object({
      icon: z.string(),
      title: z.string(),
      description: z.string(),
    }),
  ),
});

export type FeaturesLayoutProps = z.infer<typeof FeaturesLayoutSchema>;
