import type { Template } from "@brains/plugins";
import { z, StructuredContentFormatter } from "@brains/utils";
import type {
  SiteContentArrayFieldDefinition,
  SiteContentDefinition,
  SiteContentFieldDefinition,
} from "../definitions";

interface FormatterFieldMapping {
  key: string;
  label: string;
  type: "string" | "number" | "object" | "array" | "custom";
  children?: FormatterFieldMapping[];
  itemType?: "string" | "number" | "object";
  itemMappings?: FormatterFieldMapping[];
  formatter?: (value: unknown) => string;
  parser?: (text: string) => unknown;
}

function applyOptional<T extends z.ZodTypeAny>(
  schema: T,
  optional?: boolean,
): z.ZodTypeAny {
  return optional ? schema.optional() : schema;
}

function buildFieldSchema(field: SiteContentFieldDefinition): z.ZodTypeAny {
  switch (field.type) {
    case "string":
      return applyOptional(z.string(), field.optional);
    case "number":
      return applyOptional(z.number(), field.optional);
    case "enum": {
      const values = [...field.options] as [string, ...string[]];
      return applyOptional(z.enum(values), field.optional);
    }
    case "object": {
      const shape: Record<string, z.ZodTypeAny> = {};
      for (const [key, child] of Object.entries(field.fields)) {
        shape[key] = buildFieldSchema(child);
      }
      return applyOptional(z.object(shape), field.optional);
    }
    case "array": {
      let schema = z.array(buildArrayItemSchema(field));
      if (field.minItems !== undefined) {
        schema = schema.min(field.minItems);
      }
      if (field.length !== undefined) {
        schema = schema.length(field.length);
      }
      return applyOptional(schema, field.optional);
    }
  }
}

function buildArrayItemSchema(
  field: SiteContentArrayFieldDefinition,
): z.ZodTypeAny {
  const { items } = field;
  switch (items.type) {
    case "string":
      return z.string();
    case "number":
      return z.number();
    case "enum": {
      const values = [...items.options] as [string, ...string[]];
      return z.enum(values);
    }
    case "object": {
      const shape: Record<string, z.ZodTypeAny> = {};
      for (const [key, child] of Object.entries(items.fields)) {
        shape[key] = buildFieldSchema(child);
      }
      return z.object(shape);
    }
  }
}

function buildFieldMapping(
  key: string,
  field: SiteContentFieldDefinition,
): FormatterFieldMapping {
  switch (field.type) {
    case "string":
    case "enum":
      return { key, label: field.label, type: "string" };
    case "number":
      return { key, label: field.label, type: "number" };
    case "object":
      return {
        key,
        label: field.label,
        type: "object",
        children: Object.entries(field.fields).map(([childKey, childField]) =>
          buildFieldMapping(childKey, childField),
        ),
      };
    case "array": {
      const mapping: FormatterFieldMapping = {
        key,
        label: field.label,
        type: "array",
      };

      switch (field.items.type) {
        case "string":
        case "enum":
          mapping.itemType = "string";
          return mapping;
        case "number":
          mapping.itemType = "number";
          return mapping;
        case "object":
          mapping.itemType = "object";
          mapping.itemMappings = Object.entries(field.items.fields).map(
            ([childKey, childField]) => buildFieldMapping(childKey, childField),
          );
          return mapping;
      }
    }
  }
}

export function createSiteContentTemplate(
  name: string,
  section: SiteContentDefinition["sections"][string],
): Template {
  const shape: Record<string, z.ZodTypeAny> = {};
  for (const [key, field] of Object.entries(section.fields)) {
    shape[key] = buildFieldSchema(field);
  }

  const schema = z.object(shape);
  const formatter = new StructuredContentFormatter(schema, {
    title: section.title,
    mappings: Object.entries(section.fields).map(([key, field]) =>
      buildFieldMapping(key, field),
    ),
  });

  return {
    name,
    description: section.description,
    schema,
    formatter,
    requiredPermission: section.requiredPermission ?? "public",
    layout: {
      component: section.layout,
      ...(section.fullscreen !== undefined
        ? { fullscreen: section.fullscreen }
        : {}),
    },
    ...(section.runtimeScripts
      ? { runtimeScripts: section.runtimeScripts }
      : {}),
  };
}

export function createSiteContentTemplates(
  definition: SiteContentDefinition,
): Record<string, Template> {
  return Object.fromEntries(
    Object.entries(definition.sections).map(([name, section]) => [
      name,
      createSiteContentTemplate(name, section),
    ]),
  );
}
