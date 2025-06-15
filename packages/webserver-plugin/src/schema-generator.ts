import { zodToJsonSchema } from "zod-to-json-schema";
import { jsonSchemaToZod } from "json-schema-to-zod";
import type { ContentRegistry } from "./content/registry";

/**
 * Generate the content/config.ts file for Astro with inline schema definitions
 * This uses runtime Zod schemas as the single source of truth
 */
export async function generateContentConfigFile(
  registry: ContentRegistry,
): Promise<string> {
  const lines: string[] = [
    "// This file is auto-generated. Do not edit manually.",
    'import { defineCollection, z } from "astro:content";',
    "",
  ];

  const schemaDefinitions: string[] = [];
  const collections: Map<string, string> = new Map();

  // Process each template in the registry
  for (const key of registry.getTemplateKeys()) {
    const template = registry.getTemplate(key);
    if (!template) continue;

    // Handle new namespaced keys like "webserver:landing"
    const parts = key.split(":");
    const plugin = parts.length > 1 ? parts[0] : "";
    const collection = parts[parts.length - 1];

    if (!collection || !plugin) continue; // Skip malformed keys

    // Create schema name like "webserverLandingSchema"
    const schemaName = `${plugin}${capitalize(collection)}Schema`;

    try {
      // Convert Zod schema to JSON Schema
      const jsonSchema = zodToJsonSchema(template.schema, {
        $refStrategy: "none",
      });

      // Convert JSON Schema back to Zod code
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const zodCode = jsonSchemaToZod(jsonSchema as any, {
        name: schemaName,
        type: false, // Don't generate TypeScript types
      });

      // Clean up the generated code
      const cleanedCode = zodCode
        .split("\n")
        .filter((line) => !line.startsWith("import"))
        .join("\n")
        .trim();

      schemaDefinitions.push(`// Schema for ${plugin} ${collection}`);
      schemaDefinitions.push(cleanedCode);
      schemaDefinitions.push("");

      // All templates now define collections
      collections.set(collection, schemaName);
    } catch (error) {
      console.error(`Error generating schema for ${key}:`, error);
      // Fallback to a simple object schema
      schemaDefinitions.push(
        `// Schema for ${plugin} ${collection} (fallback)`,
      );
      schemaDefinitions.push(`const ${schemaName} = z.object({});`);
      schemaDefinitions.push("");

      collections.set(collection, schemaName);
    }
  }

  // Add all schema definitions
  lines.push(...schemaDefinitions);

  // Generate collection definitions
  lines.push("// Collection definitions");
  for (const [collection, schemaName] of collections.entries()) {
    lines.push(`const ${collection}Collection = defineCollection({`);
    lines.push(`  type: "data",`);
    lines.push(`  schema: ${schemaName},`);
    lines.push(`});`);
    lines.push("");
  }

  // Export collections
  lines.push("export const collections = {");
  for (const [collection] of collections.entries()) {
    lines.push(`  ${collection}: ${collection}Collection,`);
  }
  lines.push("};");

  return lines.join("\n");
}

function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}
