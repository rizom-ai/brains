import { z } from "@brains/utils/zod";
import { sha256Hex } from "@brains/utils/hash";

export const STUDIO_ENTRY_NAMING = "studio-app-[hash].js";

export const studioAssetPathSchema: z.ZodString = z
  .string()
  .regex(
    /^(?:studio-app-[a-zA-Z0-9]+\.(?:js|css|js\.map)|studio-chunks\/[a-zA-Z0-9_-]+\.(?:js|js\.map))$/,
  );

export const studioAssetManifestSchema: z.ZodType<{
  version: 2;
  entrypoints: { script: string; stylesheet: string };
  assets: Record<string, string>;
}> = z
  .object({
    version: z.literal(2),
    entrypoints: z.object({
      script: z.string().regex(/^studio-app-[a-zA-Z0-9]+\.js$/),
      stylesheet: z.string().regex(/^studio-app-[a-zA-Z0-9]+\.css$/),
    }),
    assets: z.record(studioAssetPathSchema, studioAssetPathSchema),
  })
  .refine(
    (manifest) =>
      Object.values(manifest.entrypoints).every(
        (path) => manifest.assets[path] === path,
      ) &&
      Object.entries(manifest.assets).every(([path, file]) => path === file),
  );

export function studioStylesheetName(content: string): string {
  return `studio-app-${sha256Hex(content)}.css`;
}
