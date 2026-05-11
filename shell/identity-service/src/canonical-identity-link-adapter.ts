import { BaseEntityAdapter } from "@brains/entity-service";
import type { z } from "@brains/utils";
import {
  CANONICAL_IDENTITY_LINK_ENTITY_TYPE,
  canonicalIdentityLinkBodySchema,
  canonicalIdentityLinkFrontmatterSchema,
  canonicalIdentityLinkSchema,
  type CanonicalIdentityLink,
  type CanonicalIdentityLinkEntity,
} from "./canonical-identity-link-schema";

export class CanonicalIdentityLinkAdapter extends BaseEntityAdapter<CanonicalIdentityLinkEntity> {
  constructor() {
    super({
      entityType: CANONICAL_IDENTITY_LINK_ENTITY_TYPE,
      schema: canonicalIdentityLinkSchema,
      frontmatterSchema: canonicalIdentityLinkFrontmatterSchema,
      hasBody: false,
    });
  }

  public createLinkContent(
    params: z.input<typeof canonicalIdentityLinkBodySchema>,
  ): string {
    const validated = canonicalIdentityLinkBodySchema.parse(params);
    return this.buildMarkdown("", validated);
  }

  public parseLinkBody(content: string): CanonicalIdentityLink {
    return canonicalIdentityLinkBodySchema.parse(
      this.parseFrontmatter(content),
    );
  }

  public override toMarkdown(entity: CanonicalIdentityLinkEntity): string {
    return this.createLinkContent(this.parseLinkBody(entity.content));
  }

  public fromMarkdown(markdown: string): Partial<CanonicalIdentityLinkEntity> {
    return {
      content: markdown,
      entityType: CANONICAL_IDENTITY_LINK_ENTITY_TYPE,
    };
  }

  public override extractMetadata(
    entity: CanonicalIdentityLinkEntity,
  ): Record<string, unknown> {
    const link = this.parseLinkBody(entity.content);
    return {
      canonicalId: link.canonicalId,
      displayName: link.displayName,
      actorIds: link.actors.map((actor) => actor.actorId),
    };
  }

  public override generateFrontMatter(
    entity: CanonicalIdentityLinkEntity,
  ): string {
    return this.createLinkContent(this.parseLinkBody(entity.content));
  }
}
