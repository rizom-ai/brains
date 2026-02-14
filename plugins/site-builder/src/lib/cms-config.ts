import type { z } from "@brains/utils";
import type { EntityRouteConfig } from "../config";

/**
 * CMS field widget descriptor for Sveltia/Decap CMS config
 */
export interface CmsFieldWidget {
  name: string;
  label: string;
  widget: string;
  required?: boolean;
  default?: unknown;
  options?: string[];
  field?: CmsFieldWidget;
  fields?: CmsFieldWidget[];
}

/**
 * CMS collection descriptor
 */
interface CmsCollection {
  name: string;
  label: string;
  folder: string;
  create: boolean;
  extension: string;
  format: string;
  fields: CmsFieldWidget[];
}

/**
 * CMS config structure
 */
interface CmsConfig {
  backend: {
    name: string;
    repo: string;
    branch: string;
    base_url?: string;
  };
  media_folder: string;
  public_folder: string;
  collections: CmsCollection[];
}

/**
 * Options for generating CMS config
 */
export interface CmsConfigOptions {
  repo: string;
  branch: string;
  baseUrl?: string;
  entityTypes: string[];
  getAdapter: (
    type: string,
  ) => { frontmatterSchema?: z.ZodObject<z.ZodRawShape> } | undefined;
  entityRouteConfig?: EntityRouteConfig;
}

/** Field names that should use the multi-line text widget */
const LONG_TEXT_FIELDS = new Set([
  "description",
  "excerpt",
  "summary",
  "tagline",
  "story",
]);

/**
 * Convert camelCase to Title Case label
 * e.g. "publishedAt" -> "Published At", "coverImageId" -> "Cover Image Id"
 */
function formatLabel(name: string): string {
  return name
    .replace(/([A-Z])/g, " $1")
    .replace(/^./, (c) => c.toUpperCase())
    .trim();
}

/**
 * Pluralize a label for collection display
 * Simple heuristic: add "s" unless it already ends in "s"
 */
function pluralizeLabel(label: string): string {
  if (label.endsWith("s")) return label;
  return `${label}s`;
}

/**
 * Unwrap Zod optional/default/nullable wrappers to get the inner type
 */
function unwrapZodType(
  schema: z.ZodTypeAny,
  isOptional = false,
  defaultValue?: unknown,
): { inner: z.ZodTypeAny; isOptional: boolean; defaultValue?: unknown } {
  const typeName = (schema._def as { typeName?: string }).typeName;

  if (typeName === "ZodOptional" || typeName === "ZodNullable") {
    return unwrapZodType(
      (schema._def as { innerType: z.ZodTypeAny }).innerType,
      true,
      defaultValue,
    );
  }
  if (typeName === "ZodDefault") {
    return unwrapZodType(
      (schema._def as { innerType: z.ZodTypeAny }).innerType,
      isOptional,
      (schema._def as { defaultValue: () => unknown }).defaultValue(),
    );
  }
  return { inner: schema, isOptional, defaultValue };
}

/**
 * Map a single Zod field to a Sveltia CMS widget descriptor
 */
export function zodFieldToCmsWidget(
  name: string,
  fieldSchema: z.ZodTypeAny,
): CmsFieldWidget {
  const { inner, isOptional, defaultValue } = unwrapZodType(fieldSchema);
  const typeName = (inner._def as { typeName?: string }).typeName;

  const base: CmsFieldWidget = {
    name,
    label: formatLabel(name),
    widget: "string",
    ...(isOptional && { required: false }),
    ...(defaultValue !== undefined && { default: defaultValue }),
  };

  switch (typeName) {
    case "ZodString": {
      const checks =
        (inner._def as { checks?: Array<{ kind: string }> }).checks ?? [];
      if (checks.some((c) => c.kind === "datetime")) {
        return { ...base, widget: "datetime" };
      }
      if (LONG_TEXT_FIELDS.has(name)) {
        return { ...base, widget: "text" };
      }
      return { ...base, widget: "string" };
    }
    case "ZodNumber":
      return { ...base, widget: "number" };
    case "ZodBoolean":
      return { ...base, widget: "boolean" };
    case "ZodEnum": {
      const values = (inner._def as { values: string[] }).values;
      return { ...base, widget: "select", options: values };
    }
    case "ZodArray": {
      const elementType = (inner._def as { type: z.ZodTypeAny }).type;
      const elementWidget = zodFieldToCmsWidget("item", elementType);
      if (elementWidget.widget === "object" && elementWidget.fields) {
        return { ...base, widget: "list", fields: elementWidget.fields };
      }
      return {
        ...base,
        widget: "list",
        field: { name, label: formatLabel(name), widget: elementWidget.widget },
      };
    }
    case "ZodObject": {
      const shape = (inner as z.ZodObject<z.ZodRawShape>).shape;
      const fields = Object.entries(shape).map(([key, value]) =>
        zodFieldToCmsWidget(key, value as z.ZodTypeAny),
      );
      return { ...base, widget: "object", fields };
    }
    default:
      return { ...base, widget: "string" };
  }
}

/**
 * Generate Sveltia CMS config from entity adapter schemas
 */
export function generateCmsConfig(options: CmsConfigOptions): CmsConfig {
  const collections: CmsCollection[] = [];

  for (const entityType of options.entityTypes) {
    const adapter = options.getAdapter(entityType);
    if (!adapter?.frontmatterSchema) continue;

    const shape = adapter.frontmatterSchema.shape;
    const fields: CmsFieldWidget[] = Object.entries(shape).map(([key, value]) =>
      zodFieldToCmsWidget(key, value as z.ZodTypeAny),
    );

    // Add body field for markdown content below frontmatter
    fields.push({
      name: "body",
      label: "Body",
      widget: "markdown",
    });

    const routeConfig = options.entityRouteConfig?.[entityType];
    const label = routeConfig?.label ?? formatLabel(entityType);

    collections.push({
      name: entityType,
      label: pluralizeLabel(label),
      folder: `entities/${entityType}`,
      create: true,
      extension: "md",
      format: "frontmatter",
      fields,
    });
  }

  return {
    backend: {
      name: "github",
      repo: options.repo,
      branch: options.branch,
      ...(options.baseUrl && { base_url: options.baseUrl }),
    },
    media_folder: "entities/image",
    public_folder: "/images",
    collections,
  };
}

/**
 * Static HTML for the CMS admin page
 * Loads Sveltia CMS as a client-side SPA
 */
export const CMS_ADMIN_HTML = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Content Manager</title>
  </head>
  <body>
    <script src="https://unpkg.com/@sveltia/cms/dist/sveltia-cms.js"></script>
  </body>
</html>
`;
