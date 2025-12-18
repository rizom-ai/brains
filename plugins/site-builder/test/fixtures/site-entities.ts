import type { SiteContent } from "../../src/types";
import type { SiteInfoEntity } from "../../src/services/site-info-schema";
import { computeContentHash } from "@brains/utils";

/**
 * Create a mock SiteContent entity with computed contentHash
 */
export function createMockSiteContent(
  overrides: Partial<Omit<SiteContent, "contentHash">> & { content: string },
): SiteContent {
  const content = overrides.content;
  return {
    id: overrides.id ?? "test-site-content",
    entityType: "site-content",
    content,
    contentHash: computeContentHash(content),
    routeId: overrides.routeId ?? "test-route",
    sectionId: overrides.sectionId ?? "test-section",
    template: overrides.template,
    created: overrides.created ?? new Date().toISOString(),
    updated: overrides.updated ?? new Date().toISOString(),
    metadata: overrides.metadata ?? {},
  };
}

/**
 * Create a mock SiteInfoEntity with computed contentHash
 */
export function createMockSiteInfo(
  overrides: Partial<
    Omit<SiteInfoEntity, "contentHash" | "id" | "entityType">
  > & { content: string },
): SiteInfoEntity {
  const content = overrides.content;
  return {
    id: "site-info",
    entityType: "site-info",
    content,
    contentHash: computeContentHash(content),
    created: overrides.created ?? new Date().toISOString(),
    updated: overrides.updated ?? new Date().toISOString(),
    metadata: overrides.metadata ?? {},
  };
}
