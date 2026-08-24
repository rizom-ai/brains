/**
 * The identity of an artifact derived from another entity's attachment.
 *
 * Two packages render these — a deck as a PDF, a post as a social preview —
 * and both have to answer the same question before doing the work: is the
 * artifact we already made still the artifact for this source? The key
 * covers the source's identity *and* its current content hash, so editing
 * the source renders a new one instead of handing back a stale one.
 *
 * Theme and brand are deliberately out of scope: they do not change at
 * runtime, and including them would invalidate every artifact on a restart.
 *
 * One copy rather than one per package, because the rule for when a derived
 * artifact goes stale should have one place to change.
 */
export function sourceAttachmentKey(source: {
  readonly sourceEntityType: string;
  readonly sourceEntityId: string;
  readonly attachmentType: string;
  /** Omitted when the source cannot be read; two requests still agree. */
  readonly sourceContentHash?: string | undefined;
}): string {
  const base = `${source.attachmentType}:${source.sourceEntityType}:${source.sourceEntityId}:resolved-attachment`;
  return source.sourceContentHash === undefined
    ? base
    : `${base}:${source.sourceContentHash}`;
}
