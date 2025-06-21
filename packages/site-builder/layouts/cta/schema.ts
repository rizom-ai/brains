import { z } from "zod";

export const CTALayoutSchema = z.object({
  headline: z.string(),
  subheadline: z.string().optional(),
  buttons: z.array(
    z.object({
      text: z.string(),
      link: z.string(),
      variant: z.enum(["primary", "secondary"]).optional(),
    })
  ),
});

export type CTALayoutProps = z.infer<typeof CTALayoutSchema>;