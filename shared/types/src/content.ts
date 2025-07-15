import { z } from "zod";
import type { BaseEntity } from "./entities";

/**
 * Generic site content entity interface
 */
export interface SiteContentEntity extends BaseEntity {
  routeId: string;
  sectionId: string;
}

/**
 * Route definition for content generation
 */
export interface RouteDefinition {
  path: string;
  sections: SectionDefinition[];
}

/**
 * Section definition within a route
 */
export interface SectionDefinition {
  id: string;
  title?: string;
}

/**
 * Site content entity type schema and union
 */
export const SiteContentEntityTypeSchema = z.enum([
  "site-content-preview",
  "site-content-production",
]);
export type SiteContentEntityType = z.infer<typeof SiteContentEntityTypeSchema>;
