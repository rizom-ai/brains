import type { JSX } from "preact";
import type { ProductsContent } from "./schema";
import { ProductCard } from "@brains/site-rizom";
import { ProductStageWatermark, type ProductStage } from "./stage-watermark";

/**
 * Products section layout — renders an array of `ProductCard`s.
 *
 * Each card carries its own variant so the shared ProductCard
 * component picks the right gradient, accent treatment, and SVG.
 */
const WATERMARK_STAGE: Record<
  ProductsContent["cards"][number]["variant"],
  ProductStage
> = {
  rover: "you",
  relay: "team",
  ranger: "network",
};

const WATERMARK_CLASS: Record<
  ProductsContent["cards"][number]["variant"],
  string
> = {
  rover: "text-accent",
  relay: "text-secondary",
  ranger: "text-secondary",
};

export const ProductsLayout = ({ cards }: ProductsContent): JSX.Element => (
  <>
    {cards.map((card) => (
      <ProductCard
        key={card.variant}
        {...card}
        backgroundWatermark={
          <ProductStageWatermark
            stage={WATERMARK_STAGE[card.variant]}
            className={WATERMARK_CLASS[card.variant]}
          />
        }
      />
    ))}
  </>
);
