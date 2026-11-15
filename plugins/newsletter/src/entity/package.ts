import {
  defineEntityPackage,
  z,
  type EntityPackageDefinition,
} from "@brains/sdk/entities";
import { newsletterDataSource } from "./datasources/newsletter-datasource";
import { newsletterEntity } from "./newsletter-entity";

/** The entity's config: the composite's keys, which the entity reads none of. */
const newsletterEntityConfigSchema: z.ZodObject<
  Record<never, never>,
  z.core.$loose
> = z.looseObject({});

/** The newsletter issues, rendered through the newsletter data source. */
export const newsletterEntityPackage: EntityPackageDefinition<
  readonly [typeof newsletterEntity],
  readonly [],
  typeof newsletterEntityConfigSchema
> = defineEntityPackage({
  id: "newsletter",
  config: newsletterEntityConfigSchema,
  entities: [newsletterEntity],
  dataSources: [newsletterDataSource(newsletterEntity)],
});
