import { styleGuidePackage } from "./definition";

export default styleGuidePackage;

export {
  styleGuide,
  styleGuidePackage,
  type StyleGuideEntity,
} from "./definition";
export { createStyleGuideContent } from "./markdown";
export { parseStyleGuideContent } from "./stored-form";
export {
  DEFAULT_STYLE_GUIDE,
  fetchStyleGuide,
  fetchVoiceGuidance,
  formatStyleGuidance,
  formatVisualGuidance,
  formatVoiceGuidance,
  styleGuideFromRecord,
  styleGuideFrontmatterSchema,
  styleGuideMessagingSchema,
  styleGuideVisualSchema,
  styleGuideVoiceSchema,
  type FormattedStyleGuidance,
  type StyleGuide,
  type StyleGuideFrontmatter,
  type StyleGuideMessaging,
  type StyleGuideVisual,
  type StyleGuideVoice,
} from "@brains/contracts";
