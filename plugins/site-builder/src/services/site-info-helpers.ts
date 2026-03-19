import type { ICoreEntityService } from "@brains/plugins";
import { SiteInfoAdapter } from "./site-info-adapter";
import type { SiteInfoBody } from "./site-info-schema";

/**
 * Fetch and parse the site-info entity.
 * Returns the full SiteInfoBody (title, description, cta, themeMode, etc.).
 */
export async function fetchSiteInfo(
  entityService: ICoreEntityService,
): Promise<SiteInfoBody> {
  const entities = await entityService.listEntities("site-info", {
    limit: 1,
  });
  const entity = entities[0];
  if (!entity) {
    throw new Error("Site info not found — create a site-info entity");
  }
  return new SiteInfoAdapter().parseSiteInfoBody(entity.content);
}
