import type { DataSource, BaseDataSourceContext } from "@brains/plugins";
import { parseMarkdownWithFrontmatter } from "@brains/plugins";
import type { Logger } from "@brains/utils";
import { z } from "@brains/utils";
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

/**
 * Parse product entity into template-ready format.
 * Frontmatter holds identity + metadata, body is parsed as structured content.
 */
function parseProductData(
  entity: Product,
  formatter: ProductBodyFormatter,
): ProductWithData {
  const parsed = parseMarkdownWithFrontmatter(
    entity.content,
    productFrontmatterSchema,
  );

  const body = formatter.parse(parsed.content);
  const labels = formatter.getLabels();

  return productWithDataSchema.parse({
    ...entity,
    frontmatter: parsed.metadata,
    body,
    labels,
  });
}

/**
 * Parse overview entity into template-ready format.
 * Frontmatter holds headline/tagline, body is parsed as structured content.
 */
function parseOverviewData(
  entity: Overview,
  formatter: OverviewBodyFormatter,
): OverviewWithData {
  const parsed = parseMarkdownWithFrontmatter(
    entity.content,
    overviewFrontmatterSchema,
  );

  const body = formatter.parse(parsed.content);
  const labels = formatter.getLabels();

  return overviewWithDataSchema.parse({
    ...entity,
    frontmatter: parsed.metadata,
    body,
    labels,
  });
}

/**
 * DataSource for fetching products and overview entities.
 * Products are sorted by order field. Overview is a singleton entity.
 */
export class ProductsDataSource implements DataSource {
  public readonly id = "products:entities";
  public readonly name = "Products Entity DataSource";
  public readonly description =
    "Fetches products and overview for the products page";

  private readonly overviewFormatter = new OverviewBodyFormatter();
  private readonly productFormatter = new ProductBodyFormatter();

  constructor(private readonly logger: Logger) {
    this.logger.debug("ProductsDataSource initialized");
  }

  async fetch<T>(
    query: unknown,
    outputSchema: z.ZodSchema<T>,
    context: BaseDataSourceContext,
  ): Promise<T> {
    const params = querySchema.parse(query);
    const entityService = context.entityService;

    // Fetch overview entity
    if (params.entityType === "products-overview") {
      const entities = await entityService.listEntities<Overview>(
        "products-overview",
        { limit: 1 },
      );

      const overview = entities[0];
      if (!overview) {
        throw new Error("Products overview entity not found");
      }

      const data = parseOverviewData(overview, this.overviewFormatter);
      return outputSchema.parse(data);
    }

    // Fetch single product by slug
    if (params.query?.id) {
      const entities = await entityService.listEntities<Product>("product", {
        filter: { metadata: { slug: params.query.id } },
        limit: 1,
      });

      const product = entities[0];
      if (!product) {
        throw new Error(`Product not found: ${params.query.id}`);
      }

      return outputSchema.parse(
        parseProductData(product, this.productFormatter),
      );
    }

    // Fetch all products sorted by order + overview for list page
    const [overviewEntities, productEntities] = await Promise.all([
      entityService.listEntities<Overview>("products-overview", { limit: 1 }),
      entityService.listEntities<Product>("product", {
        sortFields: [{ field: "order", direction: "asc" }],
      }),
    ]);

    const overview = overviewEntities[0];
    if (!overview) {
      throw new Error("Products overview entity not found");
    }

    return outputSchema.parse({
      overview: parseOverviewData(overview, this.overviewFormatter),
      products: productEntities.map((p) =>
        parseProductData(p, this.productFormatter),
      ),
    });
  }
}
