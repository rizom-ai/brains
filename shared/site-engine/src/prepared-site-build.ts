import {
  siteLayoutInfoSchema,
  siteMetadataTranslationSchema,
} from "@brains/site-composition";
import { z } from "@brains/utils/zod";
import {
  jsonObjectSchema,
  jsonValueSchema,
  type JsonObject,
  type JsonValue,
} from "@brains/contracts";
import { resolvedSiteImageSchema } from "./site-image-contracts";

export type { JsonObject, JsonValue } from "@brains/contracts";

export { jsonObjectSchema, jsonValueSchema } from "@brains/contracts";

/** Resolved section data passed to a renderer without further service reads. */
export const preparedSectionSchema: z.ZodObject<{
  id: z.ZodString;
  template: z.ZodString;
  data: typeof jsonObjectSchema;
}> = z.object({
  id: z.string(),
  template: z.string(),
  data: jsonObjectSchema,
});

export type PreparedSection = z.output<typeof preparedSectionSchema>;

/** A page in one of the languages it is built in. */
export const preparedAlternateSchema: z.ZodObject<{
  language: z.ZodString;
  path: z.ZodString;
}> = z.object({ language: z.string(), path: z.string() });

const preparedNavigationSchema: (typeof siteLayoutInfoSchema)["shape"]["navigation"] =
  siteLayoutInfoSchema.shape.navigation;

/** Immutable route inventory consumed by a static renderer. */
export const preparedRouteSchema: z.ZodObject<{
  id: z.ZodString;
  path: z.ZodString;
  language: z.ZodString;
  title: z.ZodString;
  pageLabel: z.ZodOptional<z.ZodString>;
  description: z.ZodString;
  layout: z.ZodString;
  fullscreen: z.ZodBoolean;
  sections: z.ZodArray<typeof preparedSectionSchema>;
  headScripts: z.ZodArray<z.ZodString>;
  alternates: z.ZodOptional<z.ZodArray<typeof preparedAlternateSchema>>;
  siteNavigation: z.ZodOptional<typeof preparedNavigationSchema>;
  siteTranslation: z.ZodOptional<typeof siteMetadataTranslationSchema>;
}> = z.object({
  id: z.string(),
  path: z.string(),
  /** The page's language tag, written into `<html lang>`. */
  language: z.string(),
  title: z.string(),
  pageLabel: z.string().optional(),
  description: z.string(),
  layout: z.string(),
  fullscreen: z.boolean(),
  sections: z.array(preparedSectionSchema),
  headScripts: z.array(z.string()),
  /** Every language the page is built in, with its path there. */
  alternates: z.array(preparedAlternateSchema).optional(),
  /** A translated page's navigation, in place of the site's. */
  siteNavigation: preparedNavigationSchema.optional(),
  /** A translated page's site title, description, copyright and CTA. */
  siteTranslation: siteMetadataTranslationSchema.optional(),
});

export type PreparedRoute = z.output<typeof preparedRouteSchema>;

/**
 * A build's fields besides its pages: what every page renders with. Renderer
 * functions, layouts, registries, and service callbacks are intentionally
 * kept out of this model.
 */
export const preparedSiteEnvelopeSchema: z.ZodObject<{
  buildId: z.ZodString;
  preparedAt: z.ZodString;
  environment: z.ZodEnum<{ preview: "preview"; production: "production" }>;
  site: typeof siteLayoutInfoSchema;
  themeCSS: z.ZodOptional<z.ZodString>;
  images: z.ZodRecord<z.ZodString, typeof resolvedSiteImageSchema>;
  staticAssets: z.ZodRecord<z.ZodString, z.ZodString>;
  publicAssets: z.ZodRecord<z.ZodString, z.ZodString>;
  globalHeadScripts: z.ZodArray<z.ZodString>;
  siteUrl: z.ZodOptional<z.ZodString>;
}> = z.object({
  buildId: z.string().min(1),
  preparedAt: z.string().datetime(),
  environment: z.enum(["preview", "production"]),
  site: siteLayoutInfoSchema,
  themeCSS: z.string().optional(),
  images: z.record(z.string(), resolvedSiteImageSchema),
  staticAssets: z.record(z.string(), z.string()),
  /** App public files keyed by output path with base64-encoded contents. */
  publicAssets: z.record(z.string(), z.string()),
  globalHeadScripts: z.array(z.string()),
  /** The environment's public URL, for absolute links between languages. */
  siteUrl: z.string().optional(),
});

export type PreparedSiteEnvelope = z.output<typeof preparedSiteEnvelopeSchema>;

/** What a build keeps of a page once it is rendered: its address and scripts. */
export const preparedRouteSummarySchema: z.ZodObject<{
  id: z.ZodString;
  path: z.ZodString;
  headScripts: z.ZodArray<z.ZodString>;
}> = preparedRouteSchema.pick({ id: true, path: true, headScripts: true });

export type PreparedRouteSummary = z.output<typeof preparedRouteSummarySchema>;

/**
 * A rendered build as it is published: its fields, and its pages' summaries
 * for the sitemap and the manifest. The pages themselves were rendered one at
 * a time and are not kept.
 */
export const preparedSiteBuildSchema: z.ZodObject<
  (typeof preparedSiteEnvelopeSchema)["shape"] & {
    routes: z.ZodArray<typeof preparedRouteSummarySchema>;
  }
> = preparedSiteEnvelopeSchema.extend({
  routes: z.array(preparedRouteSummarySchema),
});

export type PreparedSiteBuild = z.output<typeof preparedSiteBuildSchema>;

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

/** Validate, JSON-normalize, and deep-freeze a build's fields before any of
 *  its pages is prepared. */
export function createPreparedSiteEnvelope(
  input: unknown,
): PreparedSiteEnvelope {
  return deepFreeze(
    preparedSiteEnvelopeSchema.parse(normalizeJsonValue(input)),
  );
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

/**
 * A page whose section data was validated as JSON when it was prepared: its
 * fields are checked again, its data only for being a plain object, so the
 * data is kept rather than copied.
 */
const preparedRouteFieldsSchema = preparedRouteSchema.extend({
  sections: z.array(
    preparedSectionSchema.extend({
      data: z.custom<JsonObject>(
        (value) =>
          typeof value === "object" &&
          value !== null &&
          !Array.isArray(value) &&
          isPlainRecord(value),
      ),
    }),
  ),
});

/**
 * Check a prepared page's fields and deep-freeze it for its renderer. Its
 * section data, validated as JSON when the page was prepared, is kept as it
 * is rather than copied.
 */
export function freezePreparedRoute(route: unknown): PreparedRoute {
  return deepFreeze(preparedRouteFieldsSchema.parse(route));
}
