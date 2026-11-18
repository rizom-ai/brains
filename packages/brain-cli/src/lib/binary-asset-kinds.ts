import { createHash } from "node:crypto";
import { readdir, stat } from "node:fs/promises";
import { basename, join } from "node:path";
import type { AssetSource } from "@brains/entity-service";
import {
  classifyInlineDocument,
  inlineDocumentPayload,
  isLegacyPendingDocumentBytes,
  LEGACY_PENDING_DOCUMENT_PLACEHOLDER,
  type InlineDocumentBlocker,
} from "@brains/document";
import {
  classifyInlineImage,
  inlineImagePayload,
  isLegacyPendingImageBytes,
  LEGACY_PENDING_IMAGE_PLACEHOLDER,
  type InlineImageBlocker,
} from "@brains/image";
import { z } from "@brains/utils/zod";
import {
  listImageFiles,
  readImageFile,
  readReadableImageFile,
} from "./brain-data-images";

/** Why an inline row cannot become an asset as it is. */
export type InlineBlocker = InlineImageBlocker | InlineDocumentBlocker;

/** What migrating one inline row to an asset would store, or why it cannot. */
export type InlineVerdict =
  | {
      status: "ready";
      digest: string;
      sizeBytes: number;
      /** The facts the row records beside the reference. */
      metadata: Record<string, unknown>;
      /** The media type the bytes are served as. */
      mediaType: string;
    }
  | { status: "blocked"; reason: InlineBlocker; sizeBytes?: number };

/** A mirrored file's bytes as directory sync would import them. */
export interface BrainDataFile {
  id: string;
  digest: string;
  sizeBytes: number;
  created: Date;
  updated: Date;
  /** The facts the row records beside the reference. */
  metadata: Record<string, unknown>;
  /** A fresh read of the bytes, for staging. */
  source(): AssetSource;
}

/** The first of a record's files that holds its kind of bytes. */
export interface ReadableBrainDataFile {
  file?: BrainDataFile | undefined;
  /** Files that hold no such bytes, such as an earlier corrupt export. */
  unreadable: string[];
}

/**
 * An asset-backed entity type the offline commands migrate, verify and
 * reconcile: how its inline rows decode, the placeholder its pending rows
 * once held, and how its brain-data files read.
 */
export interface BinaryAssetKind {
  entityType: "image" | "document";
  /** The word for one record, as messages name it. */
  noun: string;
  placeholder: string;
  /**
   * Whether bytes, by their digest, are that placeholder for a record with
   * this status: never a record's bytes, so a file holding them restores none.
   */
  isPlaceholderBytes(digest: string, status: string | undefined): boolean;
  classify(content: string): InlineVerdict;
  payload(content: string): string | undefined;
  /** How an operator resolves each kind of blocked row. */
  hints: Partial<Record<InlineBlocker, string>>;
  /** Every id with files in the directory, its files in preference order. */
  listFiles(directory: string): Promise<Map<string, string[]>>;
  readFile(id: string, paths: string[]): Promise<ReadableBrainDataFile>;
  /** The digest of the bytes one file holds as directory sync reads it. */
  digestFile(id: string, path: string): Promise<string | undefined>;
}

export const IMAGE_ASSET_KIND: BinaryAssetKind = {
  entityType: "image",
  noun: "image",
  placeholder: LEGACY_PENDING_IMAGE_PLACEHOLDER,
  isPlaceholderBytes: isLegacyPendingImageBytes,
  classify(content) {
    const verdict = classifyInlineImage(content);
    if (verdict.status === "blocked") return verdict;
    const { digest, sizeBytes, ...facts } = verdict;
    return {
      status: "ready",
      digest,
      sizeBytes,
      mediaType: facts.mediaType,
      metadata: {
        format: facts.format,
        mediaType: facts.mediaType,
        width: facts.width,
        height: facts.height,
        sizeBytes,
      },
    };
  },
  payload: inlineImagePayload,
  hints: {
    svg: "SVG cannot become an image asset; replace it with a PNG, JPEG, GIF or WebP, or delete it",
    malformed:
      "the row is not a valid base64 image data URL; restore the image from its source file",
    "double-encoded":
      "an earlier export decoded the whole data URL and the row lost bytes; restore the image from its source file",
    unsupported:
      "the bytes are not a PNG, JPEG, GIF or WebP; convert or delete the image",
    oversized: "the image is above the asset write cap; shrink it or delete it",
  },
  listFiles: listImageFiles,
  digestFile: async (id, path) => (await readImageFile(id, path))?.digest,
  async readFile(id, paths) {
    const readable = await readReadableImageFile(id, paths);
    const { file } = readable;
    return {
      unreadable: readable.unreadable,
      file: file && {
        id,
        digest: file.digest,
        sizeBytes: file.sizeBytes,
        created: file.created,
        updated: file.updated,
        metadata: { ...file.description, sizeBytes: file.sizeBytes },
        source: file.source,
      },
    };
  },
};

const DOCUMENT_SIDECAR_SUFFIX = ".meta.json";
const sidecarSchema = z.record(z.string(), z.unknown());

export const DOCUMENT_ASSET_KIND: BinaryAssetKind = {
  entityType: "document",
  noun: "document",
  placeholder: LEGACY_PENDING_DOCUMENT_PLACEHOLDER,
  isPlaceholderBytes: (digest) => isLegacyPendingDocumentBytes(digest),
  classify(content) {
    const verdict = classifyInlineDocument(content);
    if (verdict.status === "blocked") return verdict;
    return {
      ...verdict,
      mediaType: "application/pdf",
      metadata: { sizeBytes: verdict.sizeBytes },
    };
  },
  payload: inlineDocumentPayload,
  hints: {
    malformed:
      "the row is not a valid base64 PDF data URL; restore the document from its source file",
    "double-encoded":
      "an earlier export decoded the whole data URL and the row lost bytes; restore the document from its source file",
    unsupported: "the bytes are not a PDF; replace or delete the document",
    oversized: "the PDF is above the asset write cap; shrink it or delete it",
  },
  digestFile: async (_id, path) => fileDigest(path),
  async listFiles(directory) {
    const names = await readdir(directory).catch(() => []);
    return new Map(
      names
        .filter((name) => name.toLowerCase().endsWith(".pdf"))
        .map((name) => [
          name.slice(0, -".pdf".length),
          [join(directory, name)],
        ]),
    );
  },
  async readFile(id, paths) {
    const [path] = paths;
    if (!path) return { unreadable: [] };
    const signature = await Bun.file(path).slice(0, 5).text();
    if (signature !== "%PDF-") return { unreadable: [path] };
    const stats = await stat(path);
    return {
      unreadable: [],
      file: {
        id,
        digest: await fileDigest(path),
        sizeBytes: stats.size,
        created: stats.birthtime.getTime() > 0 ? stats.birthtime : stats.mtime,
        updated: stats.mtime,
        metadata: {
          ...(await readSidecar(path)),
          sizeBytes: stats.size,
        },
        source: () => Bun.file(path).stream(),
      },
    };
  },
};

/** Every asset-backed type, in the order the commands report them. */
export const BINARY_ASSET_KINDS: readonly BinaryAssetKind[] = [
  IMAGE_ASSET_KIND,
  DOCUMENT_ASSET_KIND,
];

/**
 * A PDF's sidecar, as directory sync reads it: the filename defaults to the
 * file's own, and a corrupt sidecar falls back to the defaults.
 */
async function readSidecar(pdfPath: string): Promise<Record<string, unknown>> {
  const defaults = { mimeType: "application/pdf", filename: basename(pdfPath) };
  const sidecar = Bun.file(`${pdfPath}${DOCUMENT_SIDECAR_SUFFIX}`);
  if (!(await sidecar.exists())) return defaults;
  try {
    const parsed = sidecarSchema.safeParse(JSON.parse(await sidecar.text()));
    return { ...defaults, ...(parsed.success ? parsed.data : {}) };
  } catch {
    // A corrupt sidecar does not block a restore; the defaults still hold.
    return defaults;
  }
}

/** A file's SHA-256, hashed as a stream. */
async function fileDigest(path: string): Promise<string> {
  const hash = createHash("sha256");
  for await (const chunk of Bun.file(path).stream()) hash.update(chunk);
  return hash.digest("hex");
}
