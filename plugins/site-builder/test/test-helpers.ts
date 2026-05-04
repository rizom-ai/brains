import { h } from "preact";
import type { SiteBuilderConfig } from "../src/config";
import type { SiteBuilderServices } from "../src/lib/site-builder";
import type { ServicePluginContext } from "@brains/plugins";
import type { LayoutComponent } from "@brains/site-engine";

/**
 * Minimal layout for testing
 */
export const TestLayout: LayoutComponent = ({ sections }) => {
  return h("main", {}, sections);
};

/**
 * Create a test config with minimal required fields
 */
export function createSiteBuilderServices(
  context: ServicePluginContext,
): SiteBuilderServices {
  return {
    entityService: context.entityService,
    sendMessage: context.messaging.send,
    resolveTemplateContent: (templateName, options) =>
      context.templates.resolve(templateName, options),
    getViewTemplate: (name) => context.views.get(name),
    listViewTemplateNames: (): string[] =>
      context.views.list().map((template) => template.name),
  };
}

export function createTestConfig(
  overrides?: Partial<SiteBuilderConfig>,
): SiteBuilderConfig {
  const defaultConfig: SiteBuilderConfig = {
    previewOutputDir: "./dist/site-preview",
    productionOutputDir: "./dist/site-production",
    sharedImagesDir: "./dist/images",
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
