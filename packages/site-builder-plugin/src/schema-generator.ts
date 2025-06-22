import { zodToJsonSchema } from "zod-to-json-schema";
import { jsonSchemaToZod } from "json-schema-to-zod";
import type { z } from "zod";

/**
 * Generate the content/config.generated.ts file for Astro with inline schema definitions
 * This uses runtime Zod schemas as the single source of truth
 */
export function generateContentConfigFile(
  schemas: Map<string, z.ZodType<unknown>>,
): string {
  const lines: string[] = [
    "// This file is auto-generated. Do not edit manually.",
    'import { defineCollection, z } from "astro:content";',
    "",
  ];

  const schemaDefinitions: string[] = [];
  const collections: string[] = [];

  // Process each schema
  for (const [collection, schema] of schemas) {
    const schemaName = `${collection}Schema`;

    try {
      // Convert Zod schema to JSON Schema
      const jsonSchema = zodToJsonSchema(schema, {
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

      schemaDefinitions.push(`// Schema for ${collection}`);
      schemaDefinitions.push(cleanedCode);
      schemaDefinitions.push("");

      collections.push(collection);
    } catch (error) {
      console.error(`Error generating schema for ${collection}:`, error);
      // Fallback to a simple object schema
      schemaDefinitions.push(`// Schema for ${collection} (fallback)`);
      schemaDefinitions.push(`const ${schemaName} = z.object({});`);
      schemaDefinitions.push("");

      collections.push(collection);
    }
  }

  // Add all schema definitions
  lines.push(...schemaDefinitions);

  // Generate collection definitions
  lines.push("// Collection definitions");
  for (const collection of collections) {
    lines.push(`const ${collection}Collection = defineCollection({`);
    lines.push(`  type: "data",`);
    lines.push(`  schema: ${collection}Schema,`);
    lines.push(`});`);
    lines.push("");
  }

  // Export collections
  lines.push("export const collections = {");
  for (const collection of collections) {
    lines.push(`  ${collection}: ${collection}Collection,`);
  }
  lines.push("};");

  return lines.join("\n");
}
