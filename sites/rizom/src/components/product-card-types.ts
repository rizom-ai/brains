export type ProductVariant = "rover" | "relay" | "ranger";

export interface ProductCardContent {
  variant: ProductVariant;
  label: string;
  badge: string;
  headline: string;
  description: string;
  tags: string[];
  canvasId: string;
}
