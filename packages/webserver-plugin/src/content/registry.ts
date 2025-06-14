import type { ContentTemplate } from "@brains/types";
import { heroSectionTemplate } from "./landing/hero";
import { featuresSectionTemplate } from "./landing/features";
import { ctaSectionTemplate } from "./landing/cta";
import { landingPageTemplate } from "./landing/index";
import { dashboardTemplate } from "./dashboard/index";

/**
 * Registry of all content templates organized by page:section
 */
export class ContentRegistry {
  private templates = new Map<string, ContentTemplate<unknown>>();

  constructor() {
    // Register landing page sections
    this.register("landing:hero", heroSectionTemplate);
    this.register("landing:features", featuresSectionTemplate);
    this.register("landing:cta", ctaSectionTemplate);

    // Register composite landing page (for Astro)
    this.register("landing:index", landingPageTemplate);

    // Register dashboard
    this.register("dashboard:index", dashboardTemplate);
  }

  /**
   * Register a content template
   */
  private register<T>(key: string, template: ContentTemplate<T>): void {
    this.templates.set(key, template as ContentTemplate<unknown>);
  }

  /**
   * Get a template by key
   */
  getTemplate<T = unknown>(key: string): ContentTemplate<T> | undefined {
    return this.templates.get(key) as ContentTemplate<T> | undefined;
  }

  /**
   * Get all templates
   */
  getAllTemplates(): ContentTemplate<unknown>[] {
    return Array.from(this.templates.values());
  }

  /**
   * Get all template keys
   */
  getTemplateKeys(): string[] {
    return Array.from(this.templates.keys());
  }

  /**
   * Check if a template exists
   */
  hasTemplate(key: string): boolean {
    return this.templates.has(key);
  }
}

// Export singleton instance
export const contentRegistry = new ContentRegistry();
