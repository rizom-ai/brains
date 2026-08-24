import { slugify } from "@brains/sdk/entities";

/**
 * The id a source-rendered image lands on.
 *
 * Deterministic from the source rather than from the render, so a request
 * for "this post's social preview" resolves to the same entity every time
 * and the link handed back before the render points at something real.
 *
 * `og-image` shortens to `og` because these ids are filenames on disk once
 * directory-sync writes them out.
 */
export function sourceImageId(source: {
  sourceEntityType: string;
  sourceEntityId: string;
  attachmentType: string;
}): string {
  const prefix =
    source.attachmentType === "og-image" ? "og" : source.attachmentType;
  return slugify(
    `${prefix}-${source.sourceEntityType}-${source.sourceEntityId}`,
  );
}

/**
 * The id a generated image lands on.
 *
 * A title when one was given, `cover-<target>` when the image is for another
 * entity, and otherwise the head of the prompt — which is the only thing
 * distinguishing one standalone generation from another.
 */
export function generatedImageId(input: {
  prompt: string;
  title?: string | undefined;
  targetEntityId?: string | undefined;
}): string {
  return slugify(generatedImageTitle(input));
}

export function generatedImageTitle(input: {
  prompt: string;
  title?: string | undefined;
  targetEntityId?: string | undefined;
}): string {
  const title = input.title?.trim();
  if (title) return title;
  return input.targetEntityId
    ? `cover-${input.targetEntityId}`
    : input.prompt.slice(0, 60).trim();
}
