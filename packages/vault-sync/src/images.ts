import { encodePath } from "./drive-client";
import { IMAGE_EXTENSIONS, IMAGE_FOLDER, extensionOf } from "./paths";

/** A brain's note refers to an image entity: `![alt](entity://image/<id>)`. */
const ENTITY_IMAGE = /!\[([^\]]*)\]\(entity:\/\/image\/([^)\s]+)\)/g;
/** A Markdown image link in a vault: `![alt](path)` or `![alt](<path>)`. */
const MARKDOWN_IMAGE = /!\[([^\]]*)\]\(<?([^)>]+?)>?\)/g;
/** An Obsidian embed: `![[file]]` or `![[file|alt]]`. */
const WIKI_EMBED = /!\[\[([^\]|#]+)(?:#[^\]|]*)?(?:\|([^\]]*))?\]\]/g;

function stemOf(path: string): string {
  const name = path.slice(path.lastIndexOf("/") + 1);
  return name.slice(0, name.length - extensionOf(name).length);
}

function isImagePath(path: string): boolean {
  return IMAGE_EXTENSIONS.includes(extensionOf(path));
}

function decoded(path: string): string {
  try {
    return decodeURIComponent(path);
  } catch {
    return path;
  }
}

/**
 * A note as the vault shows it: each reference to an image entity becomes a
 * link to its file in `image/`. A reference to an image the brain does not
 * list is left as it is.
 */
export function imagesDown(
  text: string,
  /** The image files the brain lists, by entity id. */
  imageFiles: ReadonlyMap<string, string>,
): string {
  return text.replace(ENTITY_IMAGE, (whole, alt: string, id: string) => {
    const file = imageFiles.get(decoded(id));
    return file === undefined ? whole : `![${alt}](${encodePath(file)})`;
  });
}

export interface ImagesUp {
  /** The note as the brain stores it. */
  text: string;
  /** The image files the note refers to, which the brain must hold first. */
  images: string[];
  /** Images the note embeds from outside `image/`, which the brain cannot show. */
  outside: string[];
}

/**
 * A note as the brain stores it: each embed of a file in `image/`, as a
 * Markdown link or an Obsidian embed, becomes a reference to that image's
 * entity. An embed of an image elsewhere is left as it is and reported.
 */
export function imagesUp(
  text: string,
  /** Every file in the vault's `image/` folder. */
  vaultImages: ReadonlySet<string>,
): ImagesUp {
  const images = new Set<string>();
  const outside = new Set<string>();
  const reference = (alt: string, path: string): string => {
    images.add(path);
    return `![${alt}](entity://image/${encodePath(stemOf(path))})`;
  };
  const markdown = text.replace(
    MARKDOWN_IMAGE,
    (whole, alt: string, target: string) => {
      if (/^[a-z][a-z0-9+.-]*:/i.test(target)) return whole;
      const path = decoded(target).replace(/^\.?\//, "");
      if (!isImagePath(path)) return whole;
      if (path.startsWith(`${IMAGE_FOLDER}/`) && !path.slice(6).includes("/")) {
        return reference(alt, path);
      }
      outside.add(path);
      return whole;
    },
  );
  const result = markdown.replace(
    WIKI_EMBED,
    (whole, target: string, alt: string | undefined) => {
      const name = target.trim();
      if (!isImagePath(name)) return whole;
      const path = name.startsWith(`${IMAGE_FOLDER}/`)
        ? name
        : `${IMAGE_FOLDER}/${name}`;
      if (vaultImages.has(path)) return reference(alt ?? "", path);
      outside.add(name);
      return whole;
    },
  );
  return { text: result, images: [...images], outside: [...outside] };
}
