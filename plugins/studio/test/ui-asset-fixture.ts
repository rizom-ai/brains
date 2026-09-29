import { studioAssetManifestSchema } from "../src/ui-assets";

export async function readStudioStylesheet(): Promise<string> {
  const directory = new URL("../dist/ui/", import.meta.url);
  const manifest = studioAssetManifestSchema.parse(
    await Bun.file(new URL("studio-asset-manifest.json", directory)).json(),
  );
  return Bun.file(new URL(manifest.entrypoints.stylesheet, directory)).text();
}
