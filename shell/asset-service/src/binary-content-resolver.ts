import {
  binaryContentResolutionRequestSchema,
  type AssetStore,
  type BinaryContentResolutionRequest,
  type BinaryContentResolver,
} from "@brains/assets";

export interface BinaryContentMaterializationCount {
  method: BinaryContentResolutionRequest["method"];
  surface: string;
  count: number;
}

export class AssetBinaryContentResolver implements BinaryContentResolver {
  private readonly assets: AssetStore;
  private readonly materializationCounts = new Map<
    BinaryContentResolutionRequest["method"],
    Map<string, number>
  >();

  constructor(assets: AssetStore) {
    this.assets = assets;
  }

  async materializeLegacyDataUrl(
    request: BinaryContentResolutionRequest,
  ): Promise<string> {
    const parsed = binaryContentResolutionRequestSchema.parse(request);
    const bytes = await this.assets.read(parsed.ref);
    const surface = parsed.surface ?? "unspecified";
    const surfaceCounts =
      this.materializationCounts.get(parsed.method) ??
      new Map<string, number>();
    surfaceCounts.set(surface, (surfaceCounts.get(surface) ?? 0) + 1);
    this.materializationCounts.set(parsed.method, surfaceCounts);
    return `data:${parsed.mediaType};base64,${Buffer.from(bytes).toString("base64")}`;
  }

  /** Count-only bridge telemetry; references and content are never retained. */
  getMaterializationCounts(): BinaryContentMaterializationCount[] {
    return [...this.materializationCounts.entries()].flatMap(
      ([method, surfaceCounts]) =>
        [...surfaceCounts.entries()].map(([surface, count]) => ({
          method,
          surface,
          count,
        })),
    );
  }
}
