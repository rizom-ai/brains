import {
  siteLayoutInfoSchema,
  type SiteLayoutInfo,
} from "@brains/site-composition";
import { z } from "@brains/utils/zod";
import type { ResolvedSiteImage, SiteImageMap } from "./site-image-contracts";

export type JsonValue =
  null | boolean | number | string | JsonValue[] | JsonObject;

export interface JsonObject {
  [key: string]: JsonValue;
}

/** Resolved section data passed to a renderer without further service reads. */
export interface PreparedSection {
  id: string;
  template: string;
  data: JsonObject;
}

/** Immutable route inventory consumed by a static renderer. */
export interface PreparedRoute {
  id: string;
  path: string;
  title: string;
  pageLabel?: string | undefined;
  description: string;
  layout: string;
  fullscreen: boolean;
  sections: PreparedSection[];
  headScripts: string[];
}

/**
 * Serializable site-build input. Renderer functions, layouts, registries, and
 * service callbacks are intentionally kept out of this model.
 */
export interface PreparedSiteBuild {
  buildId: string;
  environment: "preview" | "production";
  site: SiteLayoutInfo;
  routes: PreparedRoute[];
  themeCSS?: string | undefined;
  images: SiteImageMap;
  staticAssets: Record<string, string>;
  /** App public files keyed by output path with base64-encoded contents. */
  publicAssets: Record<string, string>;
  globalHeadScripts: string[];
}

export const jsonValueSchema: z.ZodType<JsonValue> = z.lazy(() =>
  z.union([
    z.null(),
    z.boolean(),
    z.number().finite(),
    z.string(),
    z.array(jsonValueSchema),
    z.record(z.string(), jsonValueSchema),
  ]),
);

export const jsonObjectSchema: z.ZodType<JsonObject> = z.record(
  z.string(),
  jsonValueSchema,
);

const resolvedSiteImageSchema: z.ZodType<ResolvedSiteImage> = z.object({
  src: z.string(),
  srcset: z.string().optional(),
  sizes: z.string().optional(),
  width: z.number(),
  height: z.number(),
});

export const preparedSectionSchema: z.ZodType<PreparedSection> = z.object({
  id: z.string(),
  template: z.string(),
  data: jsonObjectSchema,
});

export const preparedRouteSchema: z.ZodType<PreparedRoute> = z.object({
  id: z.string(),
  path: z.string(),
  title: z.string(),
  pageLabel: z.string().optional(),
  description: z.string(),
  layout: z.string(),
  fullscreen: z.boolean(),
  sections: z.array(preparedSectionSchema),
  headScripts: z.array(z.string()),
});

export const preparedSiteBuildSchema: z.ZodType<PreparedSiteBuild> = z.object({
  buildId: z.string().min(1),
  environment: z.enum(["preview", "production"]),
  site: siteLayoutInfoSchema,
  routes: z.array(preparedRouteSchema),
  themeCSS: z.string().optional(),
  images: z.record(z.string(), resolvedSiteImageSchema),
  staticAssets: z.record(z.string(), z.string()),
  publicAssets: z.record(z.string(), z.string()),
  globalHeadScripts: z.array(z.string()),
});

/** Validate, JSON-normalize, and freeze renderer input as one snapshot. */
export function createPreparedSiteBuildSnapshot(
  input: unknown,
): PreparedSiteBuild {
  const parsed = preparedSiteBuildSchema.parse(input);
  const json = JSON.stringify(parsed);
  const normalized = preparedSiteBuildSchema.parse(JSON.parse(json));
  return freezePreparedSiteBuild(normalized);
}

/** Deep-freeze the serializable snapshot before handing it to a renderer. */
export function freezePreparedSiteBuild(
  build: PreparedSiteBuild,
): PreparedSiteBuild {
  return deepFreeze(build);
}

function deepFreeze<T>(value: T): T {
  if (value === null || typeof value !== "object" || Object.isFrozen(value)) {
    return value;
  }

  for (const child of Object.values(value)) {
    deepFreeze(child);
  }

  return Object.freeze(value);
}
