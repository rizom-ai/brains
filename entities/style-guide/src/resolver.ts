import type { ICoreEntityService } from "@brains/plugins";
import { styleGuideAdapter } from "./adapter";
import type { StyleGuide, StyleGuideEntity } from "./schema";

export const DEFAULT_STYLE_GUIDE: StyleGuide = {
  name: "Default style guide",
  guidance: "",
};

export async function fetchStyleGuide(
  entityService: ICoreEntityService,
): Promise<StyleGuide> {
  const entity = await entityService.getEntity<StyleGuideEntity>({
    entityType: "style-guide",
    id: "style-guide",
  });
  return entity?.id === "style-guide"
    ? styleGuideAdapter.parseStyleGuide(entity.content)
    : DEFAULT_STYLE_GUIDE;
}

function addList(lines: string[], label: string, values?: string[]): void {
  if (values && values.length > 0) {
    lines.push(`${label}: ${values.join(", ")}`);
  }
}

function formatVoiceFacet(styleGuide: StyleGuide): string {
  const lines: string[] = [];
  const { messaging, voice } = styleGuide;
  addList(lines, "Audiences", messaging?.audiences);
  if (messaging?.positioning) {
    lines.push(`Positioning: ${messaging.positioning}`);
  }
  if (voice?.summary) lines.push(`Voice: ${voice.summary}`);
  addList(lines, "Voice traits", voice?.traits);
  addList(lines, "Voice principles", voice?.principles);
  addList(lines, "Preferred terms", voice?.preferredTerms);
  addList(lines, "Avoid", voice?.avoid);
  return lines.join("\n");
}

function formatVisualFacet(styleGuide: StyleGuide): string {
  const lines: string[] = [];
  const { visual } = styleGuide;
  if (visual?.artDirection) {
    lines.push(`Art direction: ${visual.artDirection}`);
  }
  addList(lines, "Palette", visual?.palette);
  if (visual?.composition) lines.push(`Composition: ${visual.composition}`);
  if (visual?.mood) lines.push(`Mood: ${visual.mood}`);
  addList(lines, "Prefer", visual?.preferred);
  addList(lines, "Avoid", visual?.avoid);
  return lines.join("\n");
}

function appendSharedGuidance(facet: string, guidance: string): string {
  return [facet, guidance].filter(Boolean).join("\n");
}

export interface FormattedStyleGuidance {
  voice?: string | undefined;
  visual?: string | undefined;
}

/**
 * Canonical entry point for turning a style guide into prompt-ready facets.
 *
 * The shared markdown body (`guidance`) is appended exactly once — to `voice`
 * when voice is present, otherwise to `visual`. Any voice+visual workflow MUST
 * compose through this function (with `style: "both"`); combining the
 * single-facet wrappers below would append the shared body twice.
 */
export function formatStyleGuidance(
  styleGuide: StyleGuide,
  style: "voice" | "visual" | "both",
): FormattedStyleGuidance {
  let voice =
    style === "voice" || style === "both" ? formatVoiceFacet(styleGuide) : "";
  let visual =
    style === "visual" || style === "both" ? formatVisualFacet(styleGuide) : "";

  if (styleGuide.guidance) {
    if (style === "voice" || style === "both") {
      voice = appendSharedGuidance(voice, styleGuide.guidance);
    } else {
      visual = appendSharedGuidance(visual, styleGuide.guidance);
    }
  }

  return {
    ...(voice && { voice }),
    ...(visual && { visual }),
  };
}

/**
 * Voice-only convenience for single-facet callers. Includes the shared guidance
 * body. Do not combine with {@link formatVisualGuidance} for a voice+visual
 * workflow — use {@link formatStyleGuidance} with `"both"` instead, or the body
 * is emitted twice.
 */
export function formatVoiceGuidance(styleGuide: StyleGuide): string {
  return formatStyleGuidance(styleGuide, "voice").voice ?? "";
}

/**
 * Visual-only convenience for single-facet callers. Includes the shared
 * guidance body. Do not combine with {@link formatVoiceGuidance} for a
 * voice+visual workflow — use {@link formatStyleGuidance} with `"both"`
 * instead, or the body is emitted twice.
 */
export function formatVisualGuidance(styleGuide: StyleGuide): string {
  return formatStyleGuidance(styleGuide, "visual").visual ?? "";
}
