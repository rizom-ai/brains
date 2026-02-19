import { h } from "preact";
import type { SiteBuilderConfig, LayoutComponent } from "../src/config";

/**
 * Minimal layout for testing
 */
export const TestLayout: LayoutComponent = ({ sections }) => {
  return h("main", {}, sections);
};

/**
 * Create a test config with minimal required fields
 */
export function createTestConfig(
  overrides?: Partial<SiteBuilderConfig>,
): SiteBuilderConfig {
  const defaultConfig: SiteBuilderConfig = {
    previewOutputDir: "./dist/site-preview",
    productionOutputDir: "./dist/site-production",
    workingDir: "./.preact-work",
    siteInfo: {
      title: "Test Site",
      description: "Test site for unit tests",
    },
    layouts: {
      default: TestLayout,
    },
    autoRebuild: false, // Disabled for tests
    rebuildDebounce: 5000,
  };

  return {
    ...defaultConfig,
    ...overrides,
  };
}
