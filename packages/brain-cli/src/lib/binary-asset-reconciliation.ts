import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import { resolve, sep } from "node:path";
import {
  assetRefSchema,
  getAssetDigest,
  type AssetRef,
  type AssetStore,
} from "@brains/assets";
import { inspectImageBytes } from "@brains/image";
import type {
  BinaryAssetMigrationRepository,
  BinaryEntityRow,
} from "./binary-asset-migration";

const MAX_RECONCILE_IMAGE_BYTES = 100 * 1024 * 1024;

export type ImageReconciliationFailureReason =
  | "legacy-content"
  | "incomplete-metadata"
  | "unsafe-entity-id"
  | "source-missing"
  | "source-size-mismatch"
  | "source-invalid"
  | "source-digest-mismatch"
  | "restoration-failed";

export interface ImageReconciliationFailure {
  id: string;
  reason: ImageReconciliationFailureReason;
}

export interface ImageReconciliationResult {
  rowCount: number;
  presentCount: number;
  restorableCount: number;
  restoredCount: number;
  failures: ImageReconciliationFailure[];
}

export async function reconcileImageAssets(options: {
  repository: BinaryAssetMigrationRepository;
  assets: AssetStore;
  sourceDirectory: string;
  dryRun?: boolean | undefined;
}): Promise<ImageReconciliationResult> {
  const rows = await options.repository.listRows("image");
  const failures: ImageReconciliationFailure[] = [];
  let presentCount = 0;
  let restorableCount = 0;
  let restoredCount = 0;

  for (const row of rows) {
    const parsedRef = assetRefSchema.safeParse(row.content.trim());
    if (!parsedRef.success) {
      if (!isIncompleteImage(row)) {
        failures.push({ id: row.id, reason: "legacy-content" });
      }
      continue;
    }

    const facts = getBinaryFacts(row);
    if (!facts) {
      failures.push({ id: row.id, reason: "incomplete-metadata" });
      continue;
    }

    if (
      await isValidExistingAsset(
        options.assets,
        parsedRef.data,
        facts.sizeBytes,
      )
    ) {
      presentCount += 1;
      continue;
    }

    const sourcePath = buildImageSourcePath(
      options.sourceDirectory,
      row.id,
      facts.format,
    );
    if (!sourcePath) {
      failures.push({ id: row.id, reason: "unsafe-entity-id" });
      continue;
    }

    let sourceStats;
    try {
      sourceStats = await stat(sourcePath);
    } catch {
      failures.push({ id: row.id, reason: "source-missing" });
      continue;
    }
    if (
      !sourceStats.isFile() ||
      sourceStats.size !== facts.sizeBytes ||
      sourceStats.size > MAX_RECONCILE_IMAGE_BYTES
    ) {
      failures.push({ id: row.id, reason: "source-size-mismatch" });
      continue;
    }

    let bytes: Uint8Array;
    try {
      bytes = await readFile(sourcePath);
      const inspected = inspectImageBytes(bytes, facts.mediaType);
      if (
        inspected.format !== facts.format ||
        inspected.mediaType !== facts.mediaType ||
        inspected.sizeBytes !== facts.sizeBytes ||
        inspected.width !== facts.width ||
        inspected.height !== facts.height
      ) {
        failures.push({ id: row.id, reason: "source-invalid" });
        continue;
      }
    } catch {
      failures.push({ id: row.id, reason: "source-invalid" });
      continue;
    }

    const digest = createHash("sha256").update(bytes).digest("hex");
    if (digest !== getAssetDigest(parsedRef.data)) {
      failures.push({ id: row.id, reason: "source-digest-mismatch" });
      continue;
    }

    if (options.dryRun) {
      restorableCount += 1;
      continue;
    }

    try {
      const stored = await options.assets.putStream(toChunks(bytes), {
        expectedSize: facts.sizeBytes,
        maxBytes: MAX_RECONCILE_IMAGE_BYTES,
      });
      if (
        stored.ref !== parsedRef.data ||
        stored.sizeBytes !== facts.sizeBytes ||
        !(await isValidExistingAsset(
          options.assets,
          parsedRef.data,
          facts.sizeBytes,
        ))
      ) {
        throw new Error(
          "Restored asset facts do not match the entity reference",
        );
      }
      restoredCount += 1;
    } catch {
      failures.push({ id: row.id, reason: "restoration-failed" });
    }
  }

  return {
    rowCount: rows.length,
    presentCount,
    restorableCount,
    restoredCount,
    failures,
  };
}

interface ImageBinaryFacts {
  format: "png" | "jpeg" | "gif" | "webp";
  mediaType: string;
  sizeBytes: number;
  width: number;
  height: number;
}

function getBinaryFacts(row: BinaryEntityRow): ImageBinaryFacts | null {
  const format = row.metadata["format"];
  const mediaType = row.metadata["mediaType"];
  const sizeBytes = row.metadata["sizeBytes"];
  const width = row.metadata["width"];
  const height = row.metadata["height"];
  if (
    (format !== "png" &&
      format !== "jpeg" &&
      format !== "gif" &&
      format !== "webp") ||
    typeof mediaType !== "string" ||
    typeof sizeBytes !== "number" ||
    typeof width !== "number" ||
    typeof height !== "number"
  ) {
    return null;
  }
  return { format, mediaType, sizeBytes, width, height };
}

function isIncompleteImage(row: BinaryEntityRow): boolean {
  return (
    row.content.trim() === "" &&
    (row.metadata["status"] === "pending" ||
      row.metadata["status"] === "failed")
  );
}

async function isValidExistingAsset(
  assets: AssetStore,
  ref: AssetRef,
  expectedSize: number,
): Promise<boolean> {
  try {
    const verification = await assets.verify(ref);
    return verification.valid && verification.sizeBytes === expectedSize;
  } catch {
    return false;
  }
}

function buildImageSourcePath(
  sourceDirectory: string,
  entityId: string,
  format: ImageBinaryFacts["format"],
): string | null {
  const originalParts = entityId.split(":");
  if (originalParts.some(isUnsafePathPart)) return null;
  const parts =
    originalParts[0] === "image" ? originalParts.slice(1) : originalParts;
  if (parts.length === 0) return null;

  const filename = parts.at(-1);
  if (!filename) return null;
  const extension = format === "jpeg" ? ".jpg" : `.${format}`;
  const root = resolve(sourceDirectory);
  const path = resolve(
    root,
    "image",
    ...parts.slice(0, -1),
    `${filename}${extension}`,
  );
  return path.startsWith(`${root}${sep}`) ? path : null;
}

async function* toChunks(bytes: Uint8Array): AsyncGenerator<Uint8Array> {
  yield bytes;
}

function isUnsafePathPart(part: string): boolean {
  return (
    part === "" ||
    part === "." ||
    part === ".." ||
    part.includes("/") ||
    part.includes("\\") ||
    part.includes("\0")
  );
}
