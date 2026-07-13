import {
  BaseEntityAdapter,
  parseMarkdownWithFrontmatter,
} from "@brains/plugins";
import {
  sightingEntitySchema,
  sightingFrontmatterSchema,
  type SightingEntity,
  type SightingFrontmatter,
  type SightingMetadata,
} from "../schemas/sighting";
import { SIGHTING_ENTITY_TYPE } from "../lib/constants";

/**
 * Entity adapter for agent sightings — second-order agents reported by a
 * peer's directory. The body carries the reported about text so the
 * embedding places the sighting semantically like any agent.
 */
export class SightingAdapter extends BaseEntityAdapter<
  SightingEntity,
  SightingMetadata
> {
  constructor() {
    super({
      entityType: SIGHTING_ENTITY_TYPE,
      purpose:
        "A second-order agent sighted through a connected peer's directory; promoted to an agent on approval.",
      schema: sightingEntitySchema,
      frontmatterSchema: sightingFrontmatterSchema,
    });
  }

  public fromMarkdown(markdown: string): Partial<SightingEntity> {
    const frontmatter = this.parseFrontMatter(
      markdown,
      sightingFrontmatterSchema,
    );

    return {
      content: markdown,
      entityType: SIGHTING_ENTITY_TYPE,
      metadata: {
        name: frontmatter.name,
        url: frontmatter.url,
        introducedBy: frontmatter.introducedBy,
        hops: frontmatter.hops,
      },
    };
  }

  public parseSighting(entity: Pick<SightingEntity, "content">): {
    frontmatter: SightingFrontmatter;
    about: string;
  } {
    const parsed = parseMarkdownWithFrontmatter(
      entity.content,
      sightingFrontmatterSchema,
    );
    return { frontmatter: parsed.metadata, about: parsed.content };
  }

  public createSightingContent(
    frontmatter: SightingFrontmatter,
    about: string,
  ): string {
    return this.buildMarkdown(about, frontmatter);
  }
}
