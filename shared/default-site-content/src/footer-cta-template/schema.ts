import { z } from "zod";

// Footer CTA doesn't need any data
export const footerCTASchema = z.object({});

export type FooterCTAContent = z.infer<typeof footerCTASchema>;
