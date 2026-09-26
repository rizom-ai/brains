/**
 * Style guide entity package.
 *
 * A singleton holding messaging, voice, and visual guidance for generated
 * artifacts. The guidance body is the entity content; the structured
 * guidance is the entity metadata, decoded from markdown frontmatter.
 *
 * Authored against the public declarative surface (`@brains/sdk/entities`).
 * No custom markdown codec is needed: the default codec already maps
 * frontmatter to metadata, which is exactly this entity's shape.
 */

import {
  DEFAULT_STYLE_GUIDE,
  defineEntity,
  defineEntityPackage,
  styleGuideFrontmatterSchema,
  type EntityDefinition,
  type EntityOf,
  type EntityPackageDefinition,
  type StyleGuideFrontmatter,
} from "@brains/sdk/entities";

export {
  DEFAULT_STYLE_GUIDE,
  fetchStyleGuide,
  fetchVoiceGuidance,
  formatStyleGuidance,
  formatVisualGuidance,
  formatVoiceGuidance,
  parseStyleGuideContent,
  styleGuideFromEntity,
  styleGuideFrontmatterSchema,
  styleGuideMessagingSchema,
  styleGuideVisualSchema,
  styleGuideVoiceSchema,
} from "@brains/sdk/entities";
export type {
  FormattedStyleGuidance,
  StyleGuide,
  StyleGuideFrontmatter,
  StyleGuideMessaging,
  StyleGuideVisual,
  StyleGuideVoice,
} from "@brains/sdk/entities";

/** Markdown for a brand-new style guide, used to seed the singleton. */
export function defaultStyleGuideMarkdown(): string {
  return DEFAULT_STYLE_GUIDE.guidance;
}

const defaultFrontmatter: StyleGuideFrontmatter = {
  name: DEFAULT_STYLE_GUIDE.name,
};

export const styleGuide: EntityDefinition<
  "style-guide",
  typeof styleGuideFrontmatterSchema
> = defineEntity({
  type: "style-guide",
  purpose:
    "Singleton messaging, voice, and visual guidance for generated artifacts.",
  metadata: styleGuideFrontmatterSchema,
  // Guidance is prose, not searchable content — keep it out of embeddings.
  config: { embeddable: false },
  // The brain needs a style guide present even before anyone writes one.
  // Seeded only after the initial content sync, so a synced guide wins.
  seed: {
    on: "content-sync-completed",
    id: "style-guide",
    content: defaultStyleGuideMarkdown,
    metadata: defaultFrontmatter,
  },
});

export type StyleGuideEntity = EntityOf<typeof styleGuide>;

const styleGuidePackage: EntityPackageDefinition<
  readonly [typeof styleGuide],
  readonly []
> = defineEntityPackage({
  id: "style-guide",
  entities: [styleGuide],
});

export default styleGuidePackage;
