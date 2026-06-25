import type {
  BaseDataSourceContext,
  DataSource,
  DataSourceSchema,
} from "@brains/plugins";
import { z } from "@brains/utils/zod-v4";
import { parseEcosystemContent } from "../lib";

const querySchema = z.looseObject({
  query: z
    .object({
      id: z.string().optional(),
    })
    .optional(),
});

type EcosystemSectionQuery = z.output<typeof querySchema>;

export class EcosystemSectionDataSource implements DataSource {
  public readonly id = "rizom-ecosystem:entities";
  public readonly name = "Rizom Ecosystem";
  public readonly description =
    "Fetches an ecosystem-section entity for rendering";

  public async fetch<T>(
    query: unknown,
    outputSchema: DataSourceSchema<T>,
    context: BaseDataSourceContext,
  ): Promise<T> {
    const input: EcosystemSectionQuery = querySchema.parse(query ?? {});
    const id = input.query?.id ?? "rizom-ecosystem";
    const entity = await context.entityService.getEntity({
      entityType: "ecosystem-section",
      id,
    });
    if (!entity) throw new Error(`Ecosystem section not found: ${id}`);
    return outputSchema.parse(parseEcosystemContent(entity.content));
  }
}
