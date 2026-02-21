import type { SiteContent } from "../../src/schemas/site-content";
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
