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
  private templates = new Map<string, ContentTemplate<any>>();

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
  private register(key: string, template: ContentTemplate<any>): void {
    this.templates.set(key, template);
  }

  /**
   * Get a template by key
   */
  getTemplate(key: string): ContentTemplate<any> | undefined {
    return this.templates.get(key);
  }

  /**
   * Get all templates
   */
  getAllTemplates(): ContentTemplate<any>[] {
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
