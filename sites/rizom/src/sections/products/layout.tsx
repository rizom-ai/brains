import type { JSX } from "preact";
import type { ProductsContent } from "./schema";
import { ProductCard } from "../../components/ProductCard";

/**
 * Products section layout — renders an array of `ProductCard`s.
 *
 * Each card carries its own variant + canvasId so the shared
 * ProductCard component picks the right gradient/accent/canvas.
 */
export const ProductsLayout = ({ cards }: ProductsContent): JSX.Element => (
  <>
    {cards.map((card) => (
      <ProductCard key={card.variant} {...card} />
    ))}
  </>
);
