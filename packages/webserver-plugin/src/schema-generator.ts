import { zodToJsonSchema } from "zod-to-json-schema";
import { jsonSchemaToZod } from "json-schema-to-zod";
import type { ContentRegistry } from "./content/registry";

/**
 * Generate the content/config.ts file for Astro with inline schema definitions
 * This uses runtime Zod schemas as the single source of truth
 */
export async function generateContentConfigFile(registry: ContentRegistry): Promise<string> {
  const lines: string[] = [
    '// This file is auto-generated. Do not edit manually.',
    'import { defineCollection, z } from "astro:content";',
    '',
  ];

  const schemaDefinitions: string[] = [];
  const collections: Map<string, string> = new Map();

  // Process each template in the registry
  for (const key of registry.getTemplateKeys()) {
    const template = registry.getTemplate(key);
    if (!template) continue;

    const [page, section] = key.split(':');
    if (!section) continue; // Skip malformed keys
    const schemaName = `${page}${capitalize(section)}Schema`;

    try {
      // Convert Zod schema to JSON Schema
      const jsonSchema = zodToJsonSchema(template.schema, {
        $refStrategy: "none",
      });

      // Convert JSON Schema back to Zod code
      const zodCode = await jsonSchemaToZod(jsonSchema as any, {
        name: schemaName,
        type: false, // Don't generate TypeScript types
      });

      // Clean up the generated code
      const cleanedCode = zodCode
        .split('\n')
        .filter(line => !line.startsWith('import'))
        .join('\n')
        .trim();

      schemaDefinitions.push(`// Schema for ${page} ${section}`);
      schemaDefinitions.push(cleanedCode);
      schemaDefinitions.push('');

      // Track which collections we need
      if (section === 'index' && page) {
        collections.set(page, schemaName);
      }
    } catch (error) {
      console.error(`Error generating schema for ${key}:`, error);
      // Fallback to a simple object schema
      schemaDefinitions.push(`// Schema for ${page} ${section} (fallback)`);
      schemaDefinitions.push(`const ${schemaName} = z.object({});`);
      schemaDefinitions.push('');
    }
  }

  // Add all schema definitions
  lines.push(...schemaDefinitions);

  // Generate collection definitions
  lines.push('// Collection definitions');
  for (const [page, schemaName] of collections.entries()) {
    lines.push(`const ${page}Collection = defineCollection({`);
    lines.push(`  type: "data",`);
    lines.push(`  schema: ${schemaName},`);
    lines.push(`});`);
    lines.push('');
  }

  // Export collections
  lines.push('export const collections = {');
  for (const [page] of collections.entries()) {
    lines.push(`  ${page}: ${page}Collection,`);
  }
  lines.push('};');

  return lines.join('\n');
}

function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}