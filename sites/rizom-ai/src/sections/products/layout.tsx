/** @jsxImportSource preact */
import type { JSX } from "preact";
import type { ProductsContent } from "./schema";
import { ProductCard } from "./ProductCard";

export const ProductsLayout = ({ cards }: ProductsContent): JSX.Element => (
  <>
    {cards.map((card) => (
      <ProductCard
        key={card.variant}
        variant={card.variant}
        label={card.label}
        badge={card.badge}
        headline={card.headline}
        description={card.description}
        tags={card.tags}
        {...(card.tagline ? { tagline: card.tagline } : {})}
      />
    ))}
  </>
);
