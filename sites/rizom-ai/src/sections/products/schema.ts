export type ProductVariant = "rover" | "relay" | "ranger";

export interface ProductCardContent {
  variant: ProductVariant;
  label: string;
  badge: string;
  headline: string;
  description: string;
  tagline?: string[];
  tags: string[];
}

export interface ProductsContent {
  cards: ProductCardContent[];
}
