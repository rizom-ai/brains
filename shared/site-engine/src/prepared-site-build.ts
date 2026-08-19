import {
  siteLayoutInfoSchema,
  type SiteLayoutInfo,
} from "@brains/site-composition";
import { z } from "@brains/utils/zod";
import type { JsonObject, JsonValue } from "@brains/contracts";
import type { ResolvedSiteImage, SiteImageMap } from "./site-image-contracts";

export type { JsonObject, JsonValue } from "@brains/contracts";

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
  preparedAt: string;
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
    // Reject integers outside the safe range: a JSON round-trip would
    // silently reround them, breaking deterministic snapshot comparison.
    z
      .number()
      .finite()
      .refine(
        (value) => !Number.isInteger(value) || Number.isSafeInteger(value),
        { message: "integer exceeds the JSON-safe range" },
      ),
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
  preparedAt: z.string().datetime(),
  environment: z.enum(["preview", "production"]),
  site: siteLayoutInfoSchema,
  routes: z.array(preparedRouteSchema),
  themeCSS: z.string().optional(),
  images: z.record(z.string(), resolvedSiteImageSchema),
  staticAssets: z.record(z.string(), z.string()),
  publicAssets: z.record(z.string(), z.string()),
  globalHeadScripts: z.array(z.string()),
});

/**
 * Normalize a value for the prepared-site JSON boundary.
 * Undefined object properties are omitted; every other non-JSON value fails.
 */
export function normalizeJsonValue(
  value: unknown,
  path: string = "$",
  ancestors: Set<object> = new Set(),
): JsonValue {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean"
  ) {
    return value;
  }
  if (typeof value === "number") {
    return jsonValueSchema.parse(value);
  }
  if (typeof value !== "object") {
    throw new Error(`Unsupported JSON value at ${path}: ${typeof value}`);
  }
  if (ancestors.has(value)) {
    throw new Error(`Circular JSON value at ${path}`);
  }

  const nextAncestors = new Set(ancestors).add(value);
  if (Array.isArray(value)) {
    return value.map((item, index) =>
      normalizeJsonValue(item, `${path}[${index}]`, nextAncestors),
    );
  }
  if (!isPlainRecord(value)) {
    const name = value.constructor.name;
    throw new Error(`Unsupported non-JSON value at ${path}: ${name}`);
  }

  return Object.fromEntries(
    Object.entries(value)
      .filter(([, child]) => child !== undefined)
      .map(([key, child]) => [
        key,
        normalizeJsonValue(child, `${path}.${key}`, nextAncestors),
      ]),
  );
}

function isPlainRecord(value: object): value is Record<string, unknown> {
  const prototype: unknown = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

/** Validate, JSON-normalize, and freeze renderer input as one snapshot. */
export function createPreparedSiteBuildSnapshot(
  input: unknown,
): PreparedSiteBuild {
  const normalized = normalizeJsonValue(input);
  return freezePreparedSiteBuild(preparedSiteBuildSchema.parse(normalized));
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
