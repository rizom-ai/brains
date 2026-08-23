import type { ContentVisibility, ServicePluginContext } from "@brains/plugins";
import {
  contentVisibilitySchema,
  parseMarkdownWithFrontmatter,
} from "@brains/plugins";
import { z } from "@brains/utils/zod";
import { isRawEntityType } from "./config";
import { jsonResponse } from "./editor-response";

export function stripStudioPolicyMetadata(
  metadata: Record<string, unknown>,
): Record<string, unknown> {
  const { visibility: _visibility, ...rest } = metadata;
  return rest;
}

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

export function withStudioVisibility(
  frontmatter: Record<string, unknown>,
  visibility: ContentVisibility,
): Record<string, unknown> {
  const { visibility: _untrustedVisibility, ...fields } = frontmatter;
  return visibility === "public" ? fields : { ...fields, visibility };
}

export function rejectBodyForBodylessType(
  context: ServicePluginContext,
  entityType: string,
  body: string | undefined,
): Response | null {
  if (body === undefined) return null;
  const adapter = context.entities.getAdapter(entityType);
  if (adapter?.hasBody === false) {
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
