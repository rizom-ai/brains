import { parseYamlDocument } from "@brains/utils/yaml";
import { z } from "@brains/utils/zod";

const docsManifestEntrySchema = z.strictObject({
  id: z.string().min(1),
  title: z.string().min(1),
  section: z.string().min(1),
  order: z.number().int(),
  source: z.string().min(1),
});

// A guide's source carries its full frontmatter, so the manifest only maps
// its id to the source.
const guideManifestEntrySchema = z.strictObject({
  id: z.string().min(1),
  source: z.string().min(1),
});

const docsManifestSchema = z.strictObject({
  docs: z.array(docsManifestEntrySchema),
  guides: z.array(guideManifestEntrySchema),
});

export type DocsManifestEntry = z.output<typeof docsManifestEntrySchema>;
export type GuideManifestEntry = z.output<typeof guideManifestEntrySchema>;
export type DocsManifest = z.output<typeof docsManifestSchema>;

/** Parse and validate the content of docs/docs-manifest.yaml. */
export function parseDocsManifest(content: string): DocsManifest {
  const result = parseYamlDocument(content, docsManifestSchema);
  if (!result.ok) {
    throw new Error(`Invalid docs/docs-manifest.yaml: ${result.error}`);
  }
  return result.data;
}
