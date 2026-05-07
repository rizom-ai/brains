import { BaseEntityAdapter } from "@brains/plugins";
import type {
  EcosystemSection,
  EcosystemSectionMetadata,
} from "../schemas/ecosystem-section";
import {
  ecosystemSectionMetadataSchema,
  ecosystemSectionSchema,
} from "../schemas/ecosystem-section";

export class EcosystemSectionAdapter extends BaseEntityAdapter<
  EcosystemSection,
  EcosystemSectionMetadata
> {
  constructor() {
    super({
      entityType: "ecosystem-section",
      schema: ecosystemSectionSchema,
      frontmatterSchema: ecosystemSectionMetadataSchema,
    });
  }

  public fromMarkdown(markdown: string): Partial<EcosystemSection> {
    return {
      content: markdown,
      entityType: "ecosystem-section",
      metadata: this.parseFrontmatter(markdown),
    };
  }
}

export const ecosystemSectionAdapter = new EcosystemSectionAdapter();
