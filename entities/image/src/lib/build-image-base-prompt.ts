import { formatVisualGuidance, type StyleGuide } from "@brains/style-guide";

/** Build image-generation art direction from the brain's style guide. */
export function buildImageBasePrompt(styleGuide: StyleGuide): string {
  const visualGuidance = formatVisualGuidance(styleGuide).trim();
  return visualGuidance
    ? `Visual style:\n${visualGuidance}\nSubject: `
    : "Subject: ";
}
