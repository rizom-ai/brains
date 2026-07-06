import { z } from "@brains/utils/zod";

export type ProductAvailability =
  "available" | "early access" | "coming soon" | "planned";

export interface Product {
  id: string;
  name: string;
  tagline: string;
  description: string;
  availability: ProductAvailability;
  link?: string | undefined;
  icon: string;
}

export const productSchema: z.ZodType<Product> = z.object({
  id: z.string().describe("Unique identifier"),
  name: z.string().describe("Product name"),
  tagline: z.string().describe("Short memorable tagline"),
  description: z.string().describe("Brief description"),
  availability: z
    .enum(["available", "early access", "coming soon", "planned"])
    .describe("Product availability stage"),
  link: z.string().optional().describe("Link to product or docs"),
  icon: z.string().describe("Icon identifier"),
});

export interface ProductsSection {
  label: string;
  headline: string;
  description: string;
  products: Product[];
}

export const productsSectionSchema: z.ZodType<ProductsSection> = z.object({
  label: z.string().describe("Section label"),
  headline: z.string().describe("Section headline"),
  description: z.string().describe("Section description"),
  products: z
    .array(productSchema)
    .min(1)
    .max(6)
    .describe("Product showcase items"),
});
