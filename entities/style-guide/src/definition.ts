import {
  DEFAULT_STYLE_GUIDE,
  styleGuideFrontmatterSchema,
} from "@brains/contracts";
import {
  defineEntity,
  defineEntityPackage,
  type EntityDefinition,
  type EntityOf,
  type EntityPackageDefinition,
} from "@brains/sdk/entities";

/**
 * The style guide: one record of messaging, voice and visual guidance that
 * generated artifacts follow. Its structured guidance is its frontmatter,
 * read as metadata; the markdown body is free-form guidance.
 *
 * Guidance is system configuration, not content: it stays out of search
 * embeddings. The brain holds a neutral default once startup content has
 * settled, so a synced or authored guide is never overwritten.
 */
export const styleGuide: EntityDefinition<
  "style-guide",
  typeof styleGuideFrontmatterSchema
> = defineEntity({
  type: "style-guide",
  classification: "system",
  purpose:
    "Singleton messaging, voice, and visual guidance for generated artifacts.",
  metadata: styleGuideFrontmatterSchema,
  singleton: true,
  hasBody: true,
  config: { embeddable: false },
  seed: {
    on: "startup-content-settled",
    id: "style-guide",
    content: () => DEFAULT_STYLE_GUIDE.guidance,
    metadata: { name: DEFAULT_STYLE_GUIDE.name },
  },
});

export type StyleGuideEntity = EntityOf<typeof styleGuide>;

export const styleGuidePackage: EntityPackageDefinition<
  readonly [typeof styleGuide],
  readonly []
> = defineEntityPackage({ id: "style-guide", entities: [styleGuide] });
