import {
  DEFAULT_STYLE_GUIDE,
  formatStyleGuidance,
  formatVisualGuidance,
  formatVoiceGuidance,
} from "@brains/contracts";
import type { FormattedStyleGuidance, StyleGuide } from "@brains/contracts";
import type { ICoreEntityService } from "@brains/plugins";
import { styleGuideAdapter } from "./adapter";
import type { StyleGuideEntity } from "./schema";

export {
  DEFAULT_STYLE_GUIDE,
  formatStyleGuidance,
  formatVisualGuidance,
  formatVoiceGuidance,
};
export type { FormattedStyleGuidance };

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
