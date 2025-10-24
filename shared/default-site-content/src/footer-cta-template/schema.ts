import { z } from "zod";

export const footerCTASchema = z.object({
  heading: z.string().describe("Main CTA heading text"),
  buttonText: z.string().describe("Call-to-action button text"),
  buttonLink: z.string().describe("URL or anchor for the CTA button"),
});

export type FooterCTAContent = z.infer<typeof footerCTASchema>;
