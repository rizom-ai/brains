import { contentVisibilitySchema } from "@brains/sdk/entities";
import type { ContentVisibility } from "@brains/sdk/entities";
import { parseMarkdownWithFrontmatter } from "@brains/sdk/entities";
import type { ServiceEntityShapes } from "@brains/sdk/services";
import { z } from "@brains/utils/zod";
import { isRawEntityType } from "./config";
import { jsonResponse } from "./editor-response";

/**
 * The frontmatter a form sent, minus the one key that is not the type's to
 * keep. Visibility is a system field: it rides in the editor's frontmatter
 * projection so the form can show it, and it is resolved separately so a
 * strict domain schema never sees it.
 */
export function stripStudioPolicyMetadata(
  metadata: Record<string, unknown>,
): Record<string, unknown> {
  const { visibility: _visibility, ...rest } = metadata;
  return rest;
}

/** The visibility a form named, or the one that stands when it named none. */
export function resolveStudioVisibility(
  frontmatter: Record<string, unknown>,
  fallback: ContentVisibility,
):
  | { success: true; visibility: ContentVisibility }
  | { success: false; response: Response } {
  if (!Object.hasOwn(frontmatter, "visibility")) {
    return { success: true, visibility: fallback };
  }
  const parsed = contentVisibilitySchema.safeParse(frontmatter["visibility"]);
  return parsed.success
    ? { success: true, visibility: parsed.data }
    : {
        success: false,
        response: jsonResponse({ error: "Invalid content visibility" }, 400),
      };
}

/** Frontmatter as it is written to disk: public is the default and omitted. */
export function withStudioVisibility(
  frontmatter: Record<string, unknown>,
  visibility: ContentVisibility,
): Record<string, unknown> {
  const { visibility: _untrustedVisibility, ...fields } = frontmatter;
  return visibility === "public" ? fields : { ...fields, visibility };
}

/** A body sent for a type that has none is refused rather than stored. */
export function rejectBodyForBodylessType(
  shapes: ServiceEntityShapes,
  entityType: string,
  body: string | undefined,
): Response | null {
  if (body === undefined) return null;
  if (!shapes.hasBody(entityType)) {
    return jsonResponse(
      { error: `Entity type ${entityType} does not have a body` },
      400,
    );
  }
  return null;
}

export function splitEntityContent(
  entityType: string,
  content: string,
): {
  frontmatter: Record<string, unknown>;
  body: string;
} {
  // Raw types never carry frontmatter — a leading `---` is a horizontal
  // rule and must not be parsed as a YAML delimiter.
  if (isRawEntityType(entityType)) {
    return { frontmatter: {}, body: content };
  }
  try {
    const parsed = parseMarkdownWithFrontmatter(
      content,
      z.record(z.string(), z.unknown()),
    );
    return { frontmatter: parsed.metadata, body: parsed.content };
  } catch {
    return { frontmatter: {}, body: content };
  }
}
