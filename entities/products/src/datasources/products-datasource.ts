import {
  defineDataSource,
  parseMarkdownWithFrontmatter,
  z,
  type DataSourceDefinition,
} from "@brains/sdk/entities";
import type { Product } from "../schemas/product";
import {
  productFrontmatterSchema,
  productWithDataSchema,
  type ProductWithData,
} from "../schemas/product";
import type { Overview } from "../schemas/overview";
import {
  overviewFrontmatterSchema,
  overviewWithDataSchema,
  type OverviewWithData,
} from "../schemas/overview";
import { OverviewBodyFormatter } from "../formatters/overview-formatter";
import { ProductBodyFormatter } from "../formatters/product-formatter";

const querySchema = z.object({
  entityType: z.string(),
  query: z
    .object({
      id: z.string().optional(),
    })
    .optional(),
});

const overviewFormatter = new OverviewBodyFormatter();
const productFormatter = new ProductBodyFormatter();

/**
 * Parse product entity into template-ready format.
 * Frontmatter holds identity + metadata, body is parsed as structured content.
 */
function parseProductData(entity: Product): ProductWithData {
  const parsed = parseMarkdownWithFrontmatter(
    entity.content,
    productFrontmatterSchema,
  );

  return productWithDataSchema.parse({
    ...entity,
    frontmatter: parsed.metadata,
    body: productFormatter.parse(parsed.content),
    labels: productFormatter.getLabels(),
  });
}

/**
 * Parse overview entity into template-ready format.
 * Frontmatter holds headline/tagline, body is parsed as structured content.
 */
function parseOverviewData(entity: Overview): OverviewWithData {
  const parsed = parseMarkdownWithFrontmatter(
    entity.content,
    overviewFrontmatterSchema,
  );

  return overviewWithDataSchema.parse({
    ...entity,
    frontmatter: parsed.metadata,
    body: overviewFormatter.parse(parsed.content),
    labels: overviewFormatter.getLabels(),
  });
}

/**
 * Products and the overview singleton, for the products page.
 *
 * This reads two entity types, so it is declared in the general form: the
 * runtime hands it a narrow entity reader rather than the entity service.
 */
export const productsDataSource: DataSourceDefinition = defineDataSource({
  id: "entities",
  name: "Products Entity DataSource",
  description: "Fetches products and overview for the products page",
  fetch: async (query, entities) => {
    const params = querySchema.parse(query);

    const readOverview = async (): Promise<OverviewWithData> => {
      const found = await entities.listEntities<Overview>({
        entityType: "products-overview",
        options: { limit: 1 },
      });
      const overview = found[0];
      if (!overview) throw new Error("Products overview entity not found");
      return parseOverviewData(overview);
    };

    if (params.entityType === "products-overview") {
      return readOverview();
    }

    if (params.query?.id) {
      const found = await entities.listEntities<Product>({
        entityType: "product",
        options: { filter: { metadata: { slug: params.query.id } }, limit: 1 },
      });
      const product = found[0];
      if (!product) {
        throw new Error(`Product not found: ${params.query.id}`);
      }
      return { product: parseProductData(product) };
    }

    const [overview, products] = await Promise.all([
      readOverview(),
      entities.listEntities<Product>({
        entityType: "product",
        options: { sortFields: [{ field: "order", direction: "asc" }] },
      }),
    ]);

    return { overview, products: products.map(parseProductData) };
  },
});
