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

export function formatVoiceGuidance(styleGuide: StyleGuide): string {
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
  if (styleGuide.guidance) lines.push(styleGuide.guidance);
  return lines.join("\n");
}

export function formatVisualGuidance(styleGuide: StyleGuide): string {
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
  if (styleGuide.guidance) lines.push(styleGuide.guidance);
  return lines.join("\n");
}
