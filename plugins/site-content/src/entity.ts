import {
  defineEntity,
  type EntityDefinition,
  type EntityOf,
} from "@brains/sdk/entities";
import { siteContentMetadataSchema } from "./schemas/site-content";

/**
 * One content section bound to a route on the published site.
 *
 * Its id is the route and section it fills, so the section a build renders
 * and the record it renders from are the same thing named twice. The body
 * is markdown written by the section's own template formatter, which is
 * how it reads back as the value it was generated from.
 */
export const siteContentEntity: EntityDefinition<
  "site-content",
  typeof siteContentMetadataSchema
> = defineEntity({
  type: "site-content",
  purpose: "A content section bound to a route on the published site.",
  metadata: siteContentMetadataSchema,
});

export type SiteContentEntity = EntityOf<typeof siteContentEntity>;
