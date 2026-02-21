import type { SiteInfoEntity } from "../../src/services/site-info-schema";
import { createTestEntity } from "@brains/test-utils";

/**
 * Create a mock SiteInfoEntity with computed contentHash
 */
export function createMockSiteInfo(
  overrides: Partial<
    Omit<SiteInfoEntity, "contentHash" | "id" | "entityType">
  > & { content: string },
): SiteInfoEntity {
  return createTestEntity<SiteInfoEntity>("site-info", {
    id: "site-info",
    content: overrides.content,
    ...(overrides.created && { created: overrides.created }),
    ...(overrides.updated && { updated: overrides.updated }),
    metadata: overrides.metadata ?? {},
  });
}
