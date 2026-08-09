import { createHash } from "node:crypto";
import {
  assetRefSchema,
  createAssetRef,
  getAssetDigest,
  type AssetRef,
  type AssetStore,
} from "@brains/assets";
import { inspectImageBytes, tryParseDataUrl } from "@brains/image";
import { computeContentHash } from "@brains/utils/hash";

export interface BinaryEntityRow {
  id: string;
  entityType: string;
  content: string;
  contentHash: string;
  visibility: string;
  metadata: Record<string, unknown>;
  created: number;
  updated: number;
}

export interface BinaryEntityUpdate {
  id: string;
  entityType: string;
  expectedContentHash: string;
  content: AssetRef;
  contentHash: string;
  metadata: Record<string, unknown>;
}

export interface BinaryEntityIdentifier {
  id: string;
  entityType: string;
}

export interface BinaryAssetMigrationRepository {
  probeExclusiveLock(): Promise<void>;
  listRows(entityType: string): Promise<BinaryEntityRow[]>;
  listFtsEntities(entityType: string): Promise<BinaryEntityIdentifier[]>;
  applyUpdates(
    updates: BinaryEntityUpdate[],
    ftsEntities: BinaryEntityIdentifier[],
  ): Promise<void>;
}

export type ImageMigrationBlockerReason =
  "invalid-or-corrupt" | "unsupported-svg" | "unsupported-format";

export interface ImageMigrationBlocker {
  id: string;
  reason: ImageMigrationBlockerReason;
}

export interface ImageMigrationCandidate extends BinaryEntityUpdate {
  ref: AssetRef;
  digest: string;
  sizeBytes: number;
  mediaType: string;
}

export interface ImageReferenceRow {
  id: string;
  ref: AssetRef;
  contentHash: string;
  metadata: Record<string, unknown>;
}

export interface ImageMigrationAnalysis {
  rowCount: number;
  legacyCount: number;
  referenceCount: number;
  incompleteCount: number;
  legacyBytes: number;
  uniqueAssetBytes: number;
  duplicateBytesSaved: number;
  candidates: ImageMigrationCandidate[];
  references: ImageReferenceRow[];
  blockers: ImageMigrationBlocker[];
}

export interface MigrateImageAssetsOptions {
  repository: BinaryAssetMigrationRepository;
  assets: AssetStore;
  dryRun?: boolean | undefined;
  availableAssetBytes?: number | undefined;
  canReuseVerifiedAsset?:
    ((candidate: ImageMigrationCandidate) => Promise<boolean>) | undefined;
  onAssetVerified?:
    ((candidate: ImageMigrationCandidate) => Promise<void>) | undefined;
}

export interface ImageMigrationResult {
  analysis: ImageMigrationAnalysis;
  migratedCount: number;
  verifiedCount: number;
}

export interface ImageVerificationFailure {
  id: string;
  reason:
    | ImageMigrationBlockerReason
    | "legacy-content"
    | "stale-fts-row"
    | "asset-verification-failed";
}

export interface ImageVerificationResult {
  rowCount: number;
  verifiedCount: number;
  incompleteCount: number;
  failures: ImageVerificationFailure[];
}

export class BinaryAssetMigrationBlockedError extends Error {
  readonly analysis: ImageMigrationAnalysis;

  constructor(analysis: ImageMigrationAnalysis) {
    const count = analysis.blockers.length;
    super(`${count} blocking image row${count === 1 ? "" : "s"} found`);
    this.name = "BinaryAssetMigrationBlockedError";
    this.analysis = analysis;
  }
}

export function analyzeImageMigration(
  rows: BinaryEntityRow[],
): ImageMigrationAnalysis {
  const candidates: ImageMigrationCandidate[] = [];
  const references: ImageReferenceRow[] = [];
  const blockers: ImageMigrationBlocker[] = [];
  const uniqueAssets = new Map<AssetRef, number>();
  let legacyBytes = 0;
  let incompleteCount = 0;

  for (const row of rows) {
    const content = row.content.trim();
    const assetRef = assetRefSchema.safeParse(content);
    if (assetRef.success) {
      references.push({
        id: row.id,
        ref: assetRef.data,
        contentHash: row.contentHash,
        metadata: row.metadata,
      });
      continue;
    }

    if (content === "") {
      if (
        row.metadata["status"] === "pending" ||
        row.metadata["status"] === "failed"
      ) {
        incompleteCount += 1;
        continue;
      }
      blockers.push({ id: row.id, reason: "invalid-or-corrupt" });
      continue;
    }

    const parsed = tryParseDataUrl(content);
    if (!parsed) {
      blockers.push({ id: row.id, reason: classifyInvalidImage(content) });
      continue;
    }

    const inspected = inspectImageBytes(parsed.bytes, parsed.mediaType);
    const digest = createHash("sha256").update(parsed.bytes).digest("hex");
    const ref = createAssetRef(digest);
    const metadata: Record<string, unknown> = {
      ...row.metadata,
      format: inspected.format,
      mediaType: inspected.mediaType,
      sizeBytes: inspected.sizeBytes,
      width: inspected.width,
      height: inspected.height,
    };

    legacyBytes += inspected.sizeBytes;
    uniqueAssets.set(ref, inspected.sizeBytes);
    candidates.push({
      id: row.id,
      entityType: row.entityType,
      expectedContentHash: row.contentHash,
      content: ref,
      contentHash: computeContentHash(ref),
      metadata,
      digest,
      sizeBytes: inspected.sizeBytes,
      mediaType: inspected.mediaType,
      ref,
    });
  }

  const uniqueAssetBytes = Array.from(uniqueAssets.values()).reduce(
    (total, sizeBytes) => total + sizeBytes,
    0,
  );

  return {
    rowCount: rows.length,
    legacyCount: candidates.length,
    referenceCount: references.length,
    incompleteCount,
    legacyBytes,
    uniqueAssetBytes,
    duplicateBytesSaved: legacyBytes - uniqueAssetBytes,
    candidates,
    references,
    blockers,
  };
}

export async function verifyImageAssets(options: {
  repository: BinaryAssetMigrationRepository;
  assets: AssetStore;
}): Promise<ImageVerificationResult> {
  await options.repository.probeExclusiveLock();
  const rows = await options.repository.listRows("image");
  const analysis = analyzeImageMigration(rows);
  const ftsEntities = await options.repository.listFtsEntities("image");
  const failures: ImageVerificationFailure[] = [];
  for (const candidate of analysis.candidates) {
    failures.push({ id: candidate.id, reason: "legacy-content" });
  }
  failures.push(...analysis.blockers);
  for (const entity of ftsEntities) {
    failures.push({ id: entity.id, reason: "stale-fts-row" });
  }
  let verifiedCount = 0;

  for (const reference of analysis.references) {
    try {
      await verifyExistingReference(options.assets, reference);
      verifiedCount += 1;
    } catch {
      failures.push({
        id: reference.id,
        reason: "asset-verification-failed",
      });
    }
  }

  return {
    rowCount: rows.length,
    verifiedCount,
    incompleteCount: analysis.incompleteCount,
    failures,
  };
}

export async function migrateImageAssets(
  options: MigrateImageAssetsOptions,
): Promise<ImageMigrationResult> {
  await options.repository.probeExclusiveLock();
  const rows = await options.repository.listRows("image");
  const analysis = analyzeImageMigration(rows);

  if (analysis.blockers.length > 0) {
    throw new BinaryAssetMigrationBlockedError(analysis);
  }

  if (options.dryRun) {
    return { analysis, migratedCount: 0, verifiedCount: 0 };
  }

  if (
    options.availableAssetBytes !== undefined &&
    options.availableAssetBytes < analysis.uniqueAssetBytes
  ) {
    throw new Error(
      `Insufficient free space for asset prewrite: ${analysis.uniqueAssetBytes} bytes required, ${options.availableAssetBytes} bytes available`,
    );
  }

  const candidateByRef = new Map<AssetRef, ImageMigrationCandidate>();
  for (const candidate of analysis.candidates) {
    candidateByRef.set(candidate.ref, candidate);
  }
  const rowById = new Map(rows.map((row) => [row.id, row]));

  for (const candidate of candidateByRef.values()) {
    if (await options.canReuseVerifiedAsset?.(candidate)) {
      try {
        await requireValidAsset(
          options.assets,
          candidate.ref,
          candidate.sizeBytes,
        );
        await options.onAssetVerified?.(candidate);
        continue;
      } catch {
        // A stale journal is recoverable from the still-legacy database bytes.
      }
    }

    const bytes = decodeCandidateBytes(candidate, rowById.get(candidate.id));
    const stored = await options.assets.put(bytes);
    if (
      stored.ref !== candidate.ref ||
      stored.digest !== candidate.digest ||
      stored.sizeBytes !== candidate.sizeBytes
    ) {
      throw new Error(
        `Asset store returned mismatched facts for image ${candidate.id}`,
      );
    }
    await requireValidAsset(options.assets, candidate.ref, candidate.sizeBytes);
    await options.onAssetVerified?.(candidate);
  }

  for (const reference of analysis.references) {
    await verifyExistingReference(options.assets, reference);
  }

  const updates = analysis.candidates.map(toEntityUpdate);
  const ftsEntities = rows.map((row) => ({
    id: row.id,
    entityType: row.entityType,
  }));
  await options.repository.applyUpdates(updates, ftsEntities);

  return {
    analysis,
    migratedCount: updates.length,
    verifiedCount: analysis.references.length,
  };
}

function decodeCandidateBytes(
  candidate: ImageMigrationCandidate,
  row: BinaryEntityRow | undefined,
): Uint8Array {
  const parsed = row ? tryParseDataUrl(row.content.trim()) : null;
  if (!parsed) {
    throw new Error(
      `Legacy source bytes are unavailable for image ${candidate.id}`,
    );
  }
  const digest = createHash("sha256").update(parsed.bytes).digest("hex");
  if (
    digest !== candidate.digest ||
    parsed.bytes.byteLength !== candidate.sizeBytes
  ) {
    throw new Error(`Legacy source bytes changed for image ${candidate.id}`);
  }
  return parsed.bytes;
}

function classifyInvalidImage(content: string): ImageMigrationBlockerReason {
  if (/^data:image\/svg\+xml(?:;|,)/i.test(content)) {
    return "unsupported-svg";
  }
  if (
    /^data:image\//i.test(content) &&
    !/^data:image\/(?:png|jpe?g|gif|webp);/i.test(content)
  ) {
    return "unsupported-format";
  }
  return "invalid-or-corrupt";
}

function toEntityUpdate(
  candidate: ImageMigrationCandidate,
): BinaryEntityUpdate {
  return {
    id: candidate.id,
    entityType: candidate.entityType,
    expectedContentHash: candidate.expectedContentHash,
    content: candidate.content,
    contentHash: candidate.contentHash,
    metadata: candidate.metadata,
  };
}

async function requireValidAsset(
  assets: AssetStore,
  ref: AssetRef,
  expectedSize: number,
): Promise<void> {
  const verification = await assets.verify(ref);
  if (!verification.valid || verification.sizeBytes !== expectedSize) {
    throw new Error(`Asset verification failed for ${ref}`);
  }
}

async function verifyExistingReference(
  assets: AssetStore,
  reference: ImageReferenceRow,
): Promise<void> {
  const declaredSize = reference.metadata["sizeBytes"];
  if (typeof declaredSize !== "number") {
    throw new Error(`Image ${reference.id} is missing sizeBytes metadata`);
  }

  await requireValidAsset(assets, reference.ref, declaredSize);
  const bytes = await assets.read(reference.ref);
  const mediaType = reference.metadata["mediaType"];
  if (typeof mediaType !== "string") {
    throw new Error(`Image ${reference.id} is missing mediaType metadata`);
  }
  const inspected = inspectImageBytes(bytes, mediaType);
  const expectedHash = computeContentHash(reference.ref);
  if (reference.contentHash !== expectedHash) {
    throw new Error(`Image ${reference.id} has a non-canonical content hash`);
  }
  if (
    reference.metadata["format"] !== inspected.format ||
    reference.metadata["mediaType"] !== inspected.mediaType ||
    reference.metadata["sizeBytes"] !== inspected.sizeBytes ||
    reference.metadata["width"] !== inspected.width ||
    reference.metadata["height"] !== inspected.height ||
    getAssetDigest(reference.ref) !== inspectedDigest(bytes)
  ) {
    throw new Error(`Image ${reference.id} has inconsistent binary metadata`);
  }
}

function inspectedDigest(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}
