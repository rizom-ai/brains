import { createHash } from "node:crypto";
import { slugify } from "@brains/sdk/entities";

const DOCUMENT_ID_MAX_LENGTH = 80;
const DOCUMENT_ID_HASH_LENGTH = 10;

/**
 * The id a document lands on.
 *
 * Derived from the dedup key so a re-request resolves to the entity the
 * caller was already told about — the attachment URL is handed back before
 * the render finishes, and an id nothing was created under would point at
 * nothing. A `replace` deliberately lands somewhere new, because the point is
 * to keep the previous artifact.
 */
export function documentIdFor(input: {
  dedupKey: string;
  replace?: boolean | undefined;
  /** A distinguishing suffix for a replacement; the caller supplies the clock. */
  replacementSuffix?: string | undefined;
}): string {
  const base =
    input.replace === true && input.replacementSuffix !== undefined
      ? `${input.dedupKey}-${input.replacementSuffix}`
      : input.dedupKey;
  return normalizeDocumentId(base);
}

function normalizeDocumentId(base: string): string {
  const slug =
    slugify(base.replace(/[/:]+/g, " ")) || `document-${shortHash(base)}`;
  if (slug.length <= DOCUMENT_ID_MAX_LENGTH) return slug;

  // Truncating alone would collapse two documents whose keys differ only past
  // the cut — which is exactly what a content hash does.
  const suffix = `-${shortHash(base)}`;
  const prefix = slug
    .slice(0, DOCUMENT_ID_MAX_LENGTH - suffix.length)
    .replace(/-+$/g, "");
  return `${prefix}${suffix}`;
}

function shortHash(value: string): string {
  return createHash("sha256")
    .update(value)
    .digest("hex")
    .slice(0, DOCUMENT_ID_HASH_LENGTH);
}
