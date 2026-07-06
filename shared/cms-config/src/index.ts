import { formatLabel, pluralize } from "@brains/utils";
import type { z } from "@brains/utils/zod";
import { NOTE_ENTITY_TYPE } from "@brains/entity-service";

/**
 * Per-entity-type display metadata accepted by the generator.
 * Structurally compatible with `EntityDisplayEntry` from `@brains/plugins` —
 * shell callers can pass their full registry map without conversion.
 */
export interface EntityDisplayLabel {
  label?: string;
  pluralName?: string;
}

export type EntityDisplayMap = Partial<Record<string, EntityDisplayLabel>>;

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
export interface CmsCollection {
  name: string;
  label: string;
  folder?: string;
  create?: boolean;
  extension?: string;
  format?: string;
  fields?: CmsFieldWidget[];
  files?: CmsFileEntry[];
}

/**
 * CMS config structure
 */
export interface CmsConfig {
  backend: {
    name: string;
    repo: string;
    branch: string;
    base_url?: string;
    auth_endpoint?: string;
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
  authEndpoint?: string;
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
  entityDisplay?: EntityDisplayMap;
}

const LONG_TEXT_FIELDS = new Set([
  "description",
  "excerpt",
  "summary",
  "tagline",
  "story",
]);

function pluralizeLabel(label: string): string {
  if (label.endsWith("s")) return label;
  return pluralize(label);
}

interface UnwrappedSchema {
  inner: unknown;
  isOptional: boolean;
  defaultValue?: unknown;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function getDefinition(schema: unknown): Record<string, unknown> | undefined {
  if (!isRecord(schema)) return undefined;
  const definition = schema["def"];
  return isRecord(definition) ? definition : undefined;
}

function getKind(schema: unknown): string | undefined {
  const type = getDefinition(schema)?.["type"];
  return typeof type === "string" ? type : undefined;
}

function readDefaultValue(value: unknown): unknown {
  return typeof value === "function" ? value() : value;
}

function unwrapZodType(
  schema: unknown,
  isOptional = false,
  defaultValue?: unknown,
): UnwrappedSchema {
  const kind = getKind(schema);
  const definition = getDefinition(schema);

  if (kind === "optional" || kind === "nullable") {
    return unwrapZodType(definition?.["innerType"], true, defaultValue);
  }
  if (kind === "default") {
    return unwrapZodType(
      definition?.["innerType"],
      true,
      readDefaultValue(definition?.["defaultValue"]),
    );
  }
  const result: UnwrappedSchema = { inner: schema, isOptional };
  if (defaultValue !== undefined) {
    result.defaultValue = defaultValue;
  }
  return result;
}

function readEnumValues(schema: unknown): string[] | undefined {
  const entries = getDefinition(schema)?.["entries"];
  if (!isRecord(entries)) return undefined;
  const values = Object.values(entries);
  return values.every((value) => typeof value === "string")
    ? values
    : undefined;
}

function readLiteralDefault(schema: unknown): unknown {
  const values = getDefinition(schema)?.["values"];
  return Array.isArray(values) ? values[0] : undefined;
}

function hasDateTimeCheck(schema: unknown): boolean {
  const checks = getDefinition(schema)?.["checks"];
  if (!Array.isArray(checks)) return false;
  return checks.some((check) => {
    const definition = getDefinition(check);
    return definition?.["format"] === "datetime";
  });
}

function readShape(schema: unknown): Record<string, unknown> | undefined {
  if (!isRecord(schema)) return undefined;
  const shape = schema["shape"];
  return isRecord(shape) ? shape : undefined;
}

/**
 * Map a single Zod field to a Sveltia CMS widget descriptor
 */
export function zodFieldToCmsWidget(
  name: string,
  fieldSchema: unknown,
): CmsFieldWidget {
  const { inner, isOptional, defaultValue } = unwrapZodType(fieldSchema);
  const kind = getKind(inner);
  const effectiveDefault = defaultValue ?? readLiteralDefault(inner);

  const base: CmsFieldWidget = {
    name,
    label: formatLabel(name),
    widget: "string",
    ...(isOptional && { required: false }),
    ...(effectiveDefault !== undefined && { default: effectiveDefault }),
  };

  switch (kind) {
    case "string": {
      if (hasDateTimeCheck(inner)) {
        return { ...base, widget: "datetime" };
      }
      if (LONG_TEXT_FIELDS.has(name)) {
        return { ...base, widget: "text" };
      }
      return { ...base, widget: "string" };
    }
    case "number":
      return { ...base, widget: "number" };
    case "boolean":
      return { ...base, widget: "boolean" };
    case "enum": {
      const options = readEnumValues(inner);
      return { ...base, widget: "select", ...(options ? { options } : {}) };
    }
    case "array": {
      const elementType = getDefinition(inner)?.["element"];
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
    case "object": {
      const fields = Object.entries(readShape(inner) ?? {}).map(
        ([key, value]) => zodFieldToCmsWidget(key, value),
      );
      return { ...base, widget: "object", fields };
    }
    case "literal":
      return { ...base, widget: "string" };
    default:
      return { ...base, widget: "string" };
  }
}

function buildFields(
  schema: z.ZodObject<z.ZodRawShape>,
  hasBody: boolean,
): CmsFieldWidget[] {
  const fields: CmsFieldWidget[] = Object.entries(schema.shape).map(
    ([key, value]) => zodFieldToCmsWidget(key, value),
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
    const routeConfig = options.entityDisplay?.[entityType];
    const defaultLabel =
      entityType === NOTE_ENTITY_TYPE ? "Note" : formatLabel(entityType);
    const label = routeConfig?.label ?? defaultLabel;
    const pluralLabel = routeConfig?.pluralName ?? pluralizeLabel(label);

    if (adapter?.isSingleton) {
      singletonFiles.push({
        name: entityType,
        label,
        file: `${entityType}/${entityType}.md`,
        fields: buildFields(frontmatterSchema, hasBody),
      });
      continue;
    }

    // Base notes live at the repo root and may be plain Markdown without
    // frontmatter. Treat them as raw Markdown so horizontal rules (`---`) in
    // note bodies are not mistaken for YAML frontmatter delimiters by the CMS.
    // Title extraction still happens on the brain side.
    if (entityType === NOTE_ENTITY_TYPE) {
      collections.push({
        name: entityType,
        label: pluralLabel,
        folder: ".",
        create: true,
        extension: "md",
        format: "raw",
        fields: [{ name: "body", label: "Body", widget: "markdown" }],
      });
      continue;
    }

    collections.push({
      name: entityType,
      label: pluralLabel,
      folder: entityType,
      create: true,
      extension: "md",
      format: "frontmatter",
      fields: buildFields(frontmatterSchema, hasBody),
    });
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
      ...(options.authEndpoint && { auth_endpoint: options.authEndpoint }),
    },
    media_folder: "image",
    public_folder: "/images",
    collections,
  };
}

export const CMS_ADMIN_HTML = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Content Manager</title>
  </head>
  <body>
    <script src="https://unpkg.com/@sveltia/cms@0.165.1/dist/sveltia-cms.js"></script>
  </body>
</html>
`;
