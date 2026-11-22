import {
  brainCharacterSchema,
  brainCharacterBodySchema,
  type BrainCharacterEntity,
  type BrainCharacter,
} from "./brain-character-schema";
import { SingletonFrontmatterAdapter } from "./singleton-frontmatter-adapter";
import { bodyFields } from "@brains/content-formatters";
import { parseMarkdownWithFrontmatter } from "@brains/entity-service";
import { z } from "@brains/utils/zod";

// Legacy: also reads the header form written before 0.2.0-alpha.760; removed with stored-form-old-headers (docs/legacy-code-inventory.json).

/**
 * The character's next stored form (docs/external-plugin-authoring.md, The stored format): its
 * name and role in the header, its purpose and values in the body.
 */
export const characterBody: ReturnType<typeof bodyFields> = bodyFields(
  brainCharacterBodySchema,
  ["purpose", "values"],
  // A field update writes into the header, over the section it replaces.
  { headerWins: true },
);

const headerRecordSchema = z.record(z.string(), z.unknown());

/**
 * Entity adapter for Brain Character entities
 * Uses frontmatter format for Studio compatibility
 */
export class BrainCharacterAdapter extends SingletonFrontmatterAdapter<
  BrainCharacterEntity,
  BrainCharacter
> {
  constructor() {
    super({
      entityType: "brain-character",
      purpose: "The brain's own identity, character, and purpose (singleton).",
      schema: brainCharacterSchema,
      frontmatterSchema: brainCharacterBodySchema,
      // Studio and the vault present the header the character writes.
      presentedFrontmatterSchema: characterBody.nextHeader,
      isSingleton: true,
      hasBody: false,
    });
  }

  /**
   * Create character content in frontmatter format
   */
  public createCharacterContent(params: {
    name: string;
    role: string;
    purpose: string;
    values: string[];
  }): string {
    return this.buildMarkdown("", params);
  }

  /**
   * Parse character body from content
   */
  public parseCharacterBody(content: string): BrainCharacter {
    return this.parseFrontmatter(content);
  }

  /** The header keys the new form states in the body. */
  public readonly bodyFieldKeys: readonly string[] = ["purpose", "values"];

  /** Either form's header keys are the character's own. */
  public readonly writtenFrontmatterSchema: z.ZodObject =
    brainCharacterBodySchema.extend(characterBody.nextHeader.shape);

  /**
   * Convert character entity to markdown in the new form: its name and role
   * in the header, its purpose and values in the body.
   */
  public override toMarkdown(entity: BrainCharacterEntity): string {
    const written = characterBody.write(
      this.parseFrontmatter(entity.content),
      "",
    );
    return this.buildMarkdown(written.body, written.header);
  }

  /** A document in either stored form, read as the current form holds it. */
  protected override parseFrontmatter(markdown: string): BrainCharacter {
    const { metadata, content } = parseMarkdownWithFrontmatter(
      markdown,
      headerRecordSchema,
    );
    const read = characterBody.read(metadata, content);
    return super.parseFrontmatter(this.buildMarkdown(read.lead, read.header));
  }

  /**
   * Create partial entity from markdown content
   */
  public fromMarkdown(markdown: string): Partial<BrainCharacterEntity> {
    return {
      content: markdown,
      entityType: "brain-character",
    };
  }

  /**
   * Extract metadata for search/filtering
   */
  public override extractMetadata(
    entity: BrainCharacterEntity,
  ): Record<string, unknown> {
    const data = this.parseFrontmatter(entity.content);
    // The name is how lists, search and the ⌘K palette name this entry.
    return {
      name: data.name,
      role: data.role,
      values: data.values,
    };
  }
}
