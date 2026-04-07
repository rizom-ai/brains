import { createTemplate } from "@brains/templates";
import { ProductsContentSchema, type ProductsContent } from "./schema";
import { ProductsFormatter } from "./formatter";
import { ProductCard } from "../../components/ProductCard";

export {
  ProductsContentSchema,
  type ProductsContent,
  type ProductCardContent,
  type ProductVariant,
} from "./schema";
export { ProductsFormatter } from "./formatter";

/**
 * Products section — one template, one content entity, an array of
 * cards inside. Each card declares its own variant + canvasId so the
 * shared ProductCard layout renders the right gradient/accent/canvas.
 *
 * Mirrors the problem section's pattern (cards: 3 items inside one
 * section). For rizom this always renders three cards (rover/relay/
 * ranger) but the schema accepts any number ≥ 1.
 */
export const productsTemplate = createTemplate<ProductsContent>({
  name: "products",
  description: "Rizom products section — array of product cards",
  schema: ProductsContentSchema,
  formatter: new ProductsFormatter(),
  requiredPermission: "public",
  layout: {
    component: ({ cards }) => (
      <>
        {cards.map((card) => (
          <ProductCard key={card.variant} {...card} />
        ))}
      </>
    ),
  },
  // The product cards draw their mini canvases via a shared runtime
  // script. It ships as a static asset from the site package and
  // loads only on routes that actually render <products>.
  runtimeScripts: [{ src: "/canvases/products.canvas.js", defer: true }],
});
