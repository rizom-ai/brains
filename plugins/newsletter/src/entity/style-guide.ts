import {
  DEFAULT_STYLE_GUIDE,
  formatVoiceGuidance,
  parseStyleGuideContent,
} from "@brains/contracts";
import type { BaseEntity, ICoreEntityService } from "@brains/plugins";

export async function fetchVoiceGuidance(
  entityService: ICoreEntityService,
): Promise<string> {
  const entity = await entityService.getEntity<BaseEntity>({
    entityType: "style-guide",
    id: "style-guide",
  });
  const styleGuide = entity
    ? parseStyleGuideContent(entity.content)
    : DEFAULT_STYLE_GUIDE;
  return formatVoiceGuidance(styleGuide);
}
