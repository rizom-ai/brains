import { z } from "zod";

export const ProductsLayoutSchema = z.object({
  headline: z.string(),
  subheadline: z.string().optional(),
  items: z.array(
    z.object({
      icon: z.string(),
      name: z.string(),
      description: z.string(),
      category: z.string(),
      status: z.string(),
      link: z.string().optional(),
    }),
  ),
});

export type ProductsLayoutProps = z.infer<typeof ProductsLayoutSchema>;
