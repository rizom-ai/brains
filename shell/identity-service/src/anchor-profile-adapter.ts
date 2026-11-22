import { parseMarkdownWithFrontmatter } from "@brains/entity-service";
import { z } from "@brains/utils/zod";
import {
  PROFILE_BODY_FIELDS,
  PROFILE_KEY_ORDER,
  profileInCurrentShape,
  profileInNextForm,
} from "./anchor-profile-stored-form";
import {
  anchorProfileSchema,
  anchorProfileBodySchema,
  type AnchorProfileEntity,
  type AnchorProfile,
} from "./anchor-profile-schema";
import { SingletonFrontmatterAdapter } from "./singleton-frontmatter-adapter";

interface ProfileBodyParser<T> {
  parse(data: unknown): T;
}

const headerRecordSchema = z.record(z.string(), z.unknown());

/**
 * Entity adapter for Anchor Profile entities
 * Uses frontmatter format for Studio compatibility
 */
export class AnchorProfileAdapter extends SingletonFrontmatterAdapter<
  AnchorProfileEntity,
  AnchorProfile
> {
  constructor() {
    super({
      entityType: "anchor-profile",
      purpose: "The profile of the brain's Anchor (singleton).",
      schema: anchorProfileSchema,
      frontmatterSchema: anchorProfileBodySchema,
      // Studio and the vault present the header the profile writes.
      presentedFrontmatterSchema: anchorProfileBodySchema.omit({
        description: true,
        socialLinks: true,
      }),
      isSingleton: true,
      hasBody: true,
    });
  }

  /** The header keys the new form states in the body. */
  public readonly bodyFieldKeys: readonly string[] = PROFILE_BODY_FIELDS;

  /** A file read in the old form keeps the profile's key order. */
  public readonly headerKeyPlaces: readonly (readonly string[])[] = [
    PROFILE_KEY_ORDER,
  ];

  /**
   * The profile's own header keys, every one the next form moves to the
   * body among them, whichever profile extension names it: none is kept
   * back in the header as a key the profile does not name.
   */
  public readonly writtenFrontmatterSchema: z.ZodObject =
    anchorProfileBodySchema.extend({
      intro: z.string().optional(),
      purpose: z.string().optional(),
      mission: z.string().optional(),
      currentFocus: z.string().optional(),
      availability: z.string().optional(),
      workingPrinciples: z.array(z.string()).optional(),
    });

  /** A document in either stored form, as the current form holds it. */
  private inCurrentShape(markdown: string): string {
    const { metadata, content } = parseMarkdownWithFrontmatter(
      markdown,
      headerRecordSchema,
    );
    const current = profileInCurrentShape(metadata, content);
    return this.buildMarkdown(current.body, current.header);
  }

  /**
   * The profile in the new form, from a document in either: its prose,
   * principles and links as body sections and its story under "## Story".
   */
  public override toMarkdown(entity: AnchorProfileEntity): string {
    const current = this.inCurrentShape(entity.content);
    const { metadata, content } = parseMarkdownWithFrontmatter(
      current,
      headerRecordSchema,
    );
    const next = profileInNextForm(metadata, content);
    return this.buildMarkdown(next.body, next.header);
  }

  /** The profile's fields, from a document in either stored form. */
  protected override parseFrontmatter(markdown: string): AnchorProfile {
    return super.parseFrontmatter(this.inCurrentShape(markdown));
  }

  /**
   * Create profile content in frontmatter format
   * Validates input data through Zod schema
   */
  public createProfileContent(params: AnchorProfile): string {
    const validatedData = anchorProfileBodySchema.parse(params);
    return this.buildMarkdown("", validatedData);
  }

  /**
   * Parse profile body from content.
   * When called with an extended schema, parses against that schema
   * and maps the markdown body to the `story` field.
   */
  public parseProfileBody(content: string): AnchorProfile;
  public parseProfileBody<T extends Record<string, unknown>>(
    content: string,
    schema: ProfileBodyParser<T>,
  ): T;
  public parseProfileBody<T extends Record<string, unknown>>(
    content: string,
    schema?: ProfileBodyParser<T>,
  ): AnchorProfile | T {
    if (schema) {
      const { metadata: parsed, content: body } = parseMarkdownWithFrontmatter(
        this.inCurrentShape(content),
        schema,
      );
      return body ? { ...parsed, story: body } : parsed;
    }
    return this.parseFrontmatter(content);
  }

  /**
   * Create partial entity from markdown content
   * Preserves frontmatter as-is to avoid stripping extension fields (e.g., tagline, expertise)
   */
  public fromMarkdown(markdown: string): Partial<AnchorProfileEntity> {
    return {
      content: markdown,
      entityType: "anchor-profile",
    };
  }

  /**
   * Extract metadata for search/filtering
   */
  public override extractMetadata(
    entity: AnchorProfileEntity,
  ): Record<string, unknown> {
    const data = this.parseFrontmatter(entity.content);
    return {
      name: data.name,
      email: data.email,
      website: data.website,
    };
  }
}
