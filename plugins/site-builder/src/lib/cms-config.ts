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
 * CMS file entry for singleton entities within a files collection
 */
export interface CmsFileEntry {
  name: string;
  label: string;
  file: string;
  fields: CmsFieldWidget[];
}

/**
 * CMS collection descriptor
 * Folder collections have: folder, create, extension, format, fields
 * Files collections have: files (array of CmsFileEntry)
 */
interface CmsCollection {
  name: string;
  label: string;
  // Folder collection properties (multi-file entities)
  folder?: string;
  create?: boolean;
  extension?: string;
  format?: string;
  fields?: CmsFieldWidget[];
  // Files collection properties (singleton entities)
  files?: CmsFileEntry[];
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
  /** Get effective frontmatter schema for an entity type (base + any extensions) */
  getFrontmatterSchema: (
    type: string,
  ) => z.ZodObject<z.ZodRawShape> | undefined;
  /** Get adapter flags for an entity type */
  getAdapter: (type: string) =>
    | {
        isSingleton?: boolean;
        hasBody?: boolean;
      }
    | undefined;
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
    .replace(/[-_]/g, " ")
    .replace(/([A-Z])/g, " $1")
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .replace(/\s+/g, " ")
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
 * Build CMS field widgets from a frontmatter schema, optionally adding body widget
 */
function buildFields(
  schema: z.ZodObject<z.ZodRawShape>,
  hasBody: boolean,
): CmsFieldWidget[] {
  const fields: CmsFieldWidget[] = Object.entries(schema.shape).map(
    ([key, value]) => zodFieldToCmsWidget(key, value as z.ZodTypeAny),
  );

  if (hasBody) {
    fields.push({
      name: "body",
      label: "Body",
      widget: "markdown",
    });
  }

  return fields;
}

/**
 * Generate Sveltia CMS config from entity adapter schemas
 *
 * Multi-file entities get individual folder collections.
 * Singleton entities are grouped into a single "Settings" files collection.
 */
export function generateCmsConfig(options: CmsConfigOptions): CmsConfig {
  const collections: CmsCollection[] = [];
  const singletonFiles: CmsFileEntry[] = [];

  for (const entityType of options.entityTypes) {
    const frontmatterSchema = options.getFrontmatterSchema(entityType);
    if (!frontmatterSchema) continue;

    const adapter = options.getAdapter(entityType);
    const hasBody = adapter?.hasBody !== false;
    const routeConfig = options.entityRouteConfig?.[entityType];
    const label = routeConfig?.label ?? formatLabel(entityType);

    if (adapter?.isSingleton) {
      singletonFiles.push({
        name: entityType,
        label,
        file: `${entityType}/${entityType}.md`,
        fields: buildFields(frontmatterSchema, hasBody),
      });
    } else {
      collections.push({
        name: entityType,
        label: pluralizeLabel(label),
        folder: entityType,
        create: true,
        extension: "md",
        format: "frontmatter",
        fields: buildFields(frontmatterSchema, hasBody),
      });
    }
  }

  if (singletonFiles.length > 0) {
    collections.push({
      name: "settings",
      label: "Settings",
      files: singletonFiles,
    });
  }

  return {
    backend: {
      name: "github",
      repo: options.repo,
      branch: options.branch,
      ...(options.baseUrl && { base_url: options.baseUrl }),
    },
    media_folder: "image",
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
