import {
  EntityUrlGenerator,
  type EntityDisplayMap,
} from "@brains/site-composition";
import type { BaseEntity } from "@brains/entity-service";
/** Resolve only the installed site's actual routes, without exposing its registry. */
export function sitePageUrl(
  siteUrl: string | undefined,
  entity: Readonly<BaseEntity>,
  entityDisplay: EntityDisplayMap | undefined,
): string | undefined {
  const routes = new EntityUrlGenerator(entityDisplay);
  if (!siteUrl || !routes.hasRoute(entity.entityType)) return undefined;
  const slug = entity.metadata["slug"];
  return new URL(
    routes.generateUrl(
      entity.entityType,
      typeof slug === "string" && slug ? slug : entity.id,
    ),
    siteUrl,
  ).href;
}
