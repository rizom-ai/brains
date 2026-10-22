import { parseYamlDocument } from "@brains/utils/yaml";
import { z } from "@brains/utils/zod";

const docsManifestEntrySchema = z.strictObject({
  id: z.string().min(1),
  title: z.string().min(1),
  section: z.string().min(1),
  order: z.number().int(),
  source: z.string().min(1),
});

const docsManifestSchema = z.strictObject({
  docs: z.array(docsManifestEntrySchema),
});

export type DocsManifestEntry = z.output<typeof docsManifestEntrySchema>;

/** Parse and validate the content of docs/docs-manifest.yaml. */
export function parseDocsManifest(content: string): DocsManifestEntry[] {
  const result = parseYamlDocument(content, docsManifestSchema);
  if (!result.ok) {
    throw new Error(`Invalid docs/docs-manifest.yaml: ${result.error}`);
  }
  return result.data.docs;
}
