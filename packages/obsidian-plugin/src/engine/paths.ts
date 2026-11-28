/** The image file types the brain stores, in its `image` folder. */
export const IMAGE_EXTENSIONS: readonly string[] = [
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".webp",
];

/** The text file types the brain stores. */
const TEXT_EXTENSIONS: readonly string[] = [".md", ".yaml"];

/** Where the plugin puts a version that lost; never synced. */
export const CONFLICTS_FOLDER = "Conflicts";

/** Where the plugin writes the brain's templates, fileClasses and bases. */
export const OBSIDIAN_FILES_FOLDER = "_obsidian";

/** The folder of image entities. */
export const IMAGE_FOLDER = "image";

/** The folder of document entities: the brain's PDFs. */
export const DOCUMENT_FOLDER = "document";
const PDF_EXTENSION = ".pdf";
const PDF_PLACE = "The brain keeps PDFs in the document folder.";

/**
 * Entity types the brain lists that a vault does not hold: conflicts are the
 * brain's own record of edits that lost.
 */
const UNSYNCED_TYPES: ReadonlySet<string> = new Set(["conflict"]);

/** Whether the drive's folder of an entity type is one the vault mirrors. */
export function isSyncedType(type: string): boolean {
  return !type.startsWith(".") && !UNSYNCED_TYPES.has(type);
}

/**
 * How a synced file is handled: text is compared and shown as text, an image
 * is a file of bytes notes embed, and any other file is its bytes.
 */
export type FileFlavor = "text" | "image" | "file";

export type Placement =
  /** A file the vault and the brain keep in step. */
  | { kind: "synced"; flavor: FileFlavor }
  /** The vault's own or the plugin's own: never synced, never listed. */
  | { kind: "ignored" }
  /** A file the brain has no place for, and why. */
  | { kind: "local"; reason: string };

export function extensionOf(path: string): string {
  const name = path.slice(path.lastIndexOf("/") + 1);
  const dot = name.lastIndexOf(".");
  return dot <= 0 ? "" : name.slice(dot).toLowerCase();
}

/**
 * Where a vault path sits in the brain. The brain's structure leads: notes
 * are the files at the vault's root, and every other entry is in the folder
 * of its type, as the drive lists it.
 */
export function placementOf(
  path: string,
  typeFolders: ReadonlySet<string>,
): Placement {
  const segments = path.split("/");
  const [first] = segments;
  if (first === undefined || segments.some((name) => name.startsWith("."))) {
    return { kind: "ignored" };
  }
  // The plugin's own: copies of versions that lost, and the templates,
  // fileClasses and bases it writes from the brain's types.
  if (first === CONFLICTS_FOLDER || first === OBSIDIAN_FILES_FOLDER) {
    return { kind: "ignored" };
  }
  const extension = extensionOf(path);
  if (segments.length === 1) {
    if (extension === ".md") return { kind: "synced", flavor: "text" };
    return {
      kind: "local",
      reason:
        extension === PDF_EXTENSION
          ? PDF_PLACE
          : "The brain keeps notes (.md files) at the top of the vault; other files there stay in the vault.",
    };
  }
  if (!typeFolders.has(first) || !isSyncedType(first)) {
    return {
      kind: "local",
      reason: `The brain has no "${first}" folder. Notes go at the top of the vault; other entries go in the folder of their type.`,
    };
  }
  if (first === DOCUMENT_FOLDER) {
    return extension === PDF_EXTENSION
      ? { kind: "synced", flavor: "file" }
      : { kind: "local", reason: "The document folder holds PDFs." };
  }
  if (extension === PDF_EXTENSION) return { kind: "local", reason: PDF_PLACE };
  if (first === IMAGE_FOLDER) {
    return IMAGE_EXTENSIONS.includes(extension)
      ? { kind: "synced", flavor: "image" }
      : {
          kind: "local",
          reason: "The image folder holds PNG, JPEG, GIF and WebP images.",
        };
  }
  return TEXT_EXTENSIONS.includes(extension)
    ? { kind: "synced", flavor: "text" }
    : {
        kind: "local",
        reason: "The brain does not store this type of file here.",
      };
}

/** The name a copy of a version that lost gets in the Conflicts folder. */
export function conflictCopyPath(path: string, at: Date): string {
  const extension = extensionOf(path);
  const stem = path
    .slice(0, path.length - extension.length)
    .split("/")
    .join(" - ");
  const pad = (value: number): string => String(value).padStart(2, "0");
  const stamp =
    `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())} ` +
    `${pad(at.getHours())}.${pad(at.getMinutes())}.${pad(at.getSeconds())}`;
  return `${CONFLICTS_FOLDER}/${stem} ${stamp}${extension}`;
}
