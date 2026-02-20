import type { SiteContent } from "../../src/types";
import type { SiteInfoEntity } from "../../src/services/site-info-schema";
import { createTestEntity } from "@brains/test-utils";

/**
 * Create a mock SiteContent entity with computed contentHash
 */
export function createMockSiteContent(
  overrides: Partial<Omit<SiteContent, "contentHash">> & { content: string },
): SiteContent {
  const metadata = overrides.metadata ?? {
    routeId: "test-route",
    sectionId: "test-section",
  };
  return createTestEntity<SiteContent>("site-content", {
    id: overrides.id ?? "test-site-content",
    content: overrides.content,
    ...(overrides.template && { template: overrides.template }),
    ...(overrides.created && { created: overrides.created }),
    ...(overrides.updated && { updated: overrides.updated }),
    metadata,
  });
}

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
