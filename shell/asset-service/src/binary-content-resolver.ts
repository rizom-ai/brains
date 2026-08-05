import {
  binaryContentResolutionRequestSchema,
  type AssetStore,
  type BinaryContentResolutionRequest,
  type BinaryContentResolver,
} from "@brains/assets";

export class AssetBinaryContentResolver implements BinaryContentResolver {
  private readonly assets: AssetStore;

  constructor(assets: AssetStore) {
    this.assets = assets;
  }

  async materializeLegacyDataUrl(
    request: BinaryContentResolutionRequest,
  ): Promise<string> {
    const parsed = binaryContentResolutionRequestSchema.parse(request);
    const bytes = await this.assets.read(parsed.ref);
    return `data:${parsed.mediaType};base64,${Buffer.from(bytes).toString("base64")}`;
  }
}
