import { createHash } from "node:crypto";
import { readdir, stat } from "node:fs/promises";
import { extname, join } from "node:path";
import { IMAGE_EXTENSIONS } from "@brains/directory-sync";
import {
  base64AssetSource,
  computeAssetDigest,
  type AssetSource,
} from "@brains/entity-service";
import {
  bytesImageReader,
  describeImage,
  fileImageReader,
  inlineImagePayload,
  type ImageByteDescription,
  type ImageByteReader,
} from "@brains/image";

/** Binary image files first, then text-form `.md` data URLs. */
const IMAGE_FILE_EXTENSIONS: readonly string[] = [...IMAGE_EXTENSIONS, ".md"];

/** An image file's bytes as directory sync would import them. */
export interface ImageFile {
  id: string;
  digest: string;
  sizeBytes: number;
  /** Reads ranges of the bytes, to describe the image without loading it. */
  read: ImageByteReader;
  created: Date;
  updated: Date;
  /** A fresh read of the bytes, for staging. */
  source(): AssetSource;
}

/**
 * Every image id with files in the directory, each with its files in
 * preference order: binary formats first, then text-form.
 */
export async function listImageFiles(
  directory: string,
): Promise<Map<string, string[]>> {
  const names = await readdir(directory).catch(() => []);
  return IMAGE_FILE_EXTENSIONS.flatMap((extension) =>
    names
      .filter((name) => extname(name) === extension)
      .map((name) => ({
        id: name.slice(0, -extension.length),
        path: join(directory, name),
      })),
  ).reduce(
    (files, { id, path }) => files.set(id, [...(files.get(id) ?? []), path]),
    new Map<string, string[]>(),
  );
}

/** The first of an image's files that holds a supported image. */
export interface ReadableImageFile {
  file?: (ImageFile & { description: ImageByteDescription }) | undefined;
  /** Files that hold no supported image, such as an earlier corrupt export. */
  unreadable: string[];
}

export async function readReadableImageFile(
  id: string,
  paths: string[],
): Promise<ReadableImageFile> {
  const read = await Promise.all(
    paths.map(async (path) => {
      const file = await readImageFile(id, path);
      const description = file && (await describeImage(file.read));
      return { path, file: file && description && { ...file, description } };
    }),
  );
  return {
    file: read.find((candidate) => candidate.file)?.file,
    unreadable: read
      .filter((candidate) => !candidate.file)
      .map((candidate) => candidate.path),
  };
}

/**
 * Read an image file: binary files are hashed as a stream, text-form files
 * are decoded. Undefined when a text-form file holds no base64 data URL.
 */
export async function readImageFile(
  id: string,
  path: string,
): Promise<ImageFile | undefined> {
  const stats = await stat(path);
  const times = {
    created: stats.birthtime.getTime() > 0 ? stats.birthtime : stats.mtime,
    updated: stats.mtime,
  };
  if (extname(path) === ".md") {
    const bytes = decodeTextForm(await Bun.file(path).text());
    if (!bytes) return undefined;
    return {
      id,
      digest: computeAssetDigest(bytes),
      sizeBytes: bytes.byteLength,
      read: bytesImageReader(bytes),
      ...times,
      source: () => bytes,
    };
  }
  const hash = createHash("sha256");
  for await (const chunk of Bun.file(path).stream()) hash.update(chunk);
  return {
    id,
    digest: hash.digest("hex"),
    sizeBytes: stats.size,
    read: fileImageReader(path),
    ...times,
    source: () => Bun.file(path).stream(),
  };
}

function decodeTextForm(text: string): Buffer | undefined {
  const payload = inlineImagePayload(text);
  if (!payload) return undefined;
  try {
    return Buffer.concat([...base64AssetSource(payload)]);
  } catch {
    // Malformed base64 is what this answer means: the file holds no image.
    return undefined;
  }
}
