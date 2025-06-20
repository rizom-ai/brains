import { z } from "zod";

export const productSchema = z.object({
  id: z.string().describe("Unique identifier"),
  name: z.string().describe("Product name"),
  tagline: z.string().describe("Short memorable tagline"),
  description: z.string().describe("Brief description"),
  status: z
    .enum(["live", "beta", "alpha", "concept"])
    .describe("Development status"),
  link: z.string().optional().describe("Link to product or docs"),
  icon: z.string().describe("Icon identifier"),
});

export const productsSectionSchema = z.object({
  label: z.string().describe("Section label"),
  headline: z.string().describe("Section headline"),
  description: z.string().describe("Section description"),
  products: z
    .array(productSchema)
    .min(1)
    .max(6)
    .describe("Product showcase items"),
});

export type Product = z.infer<typeof productSchema>;
export type ProductsSection = z.infer<typeof productsSectionSchema>;
