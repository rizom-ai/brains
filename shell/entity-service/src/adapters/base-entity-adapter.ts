import { z } from "@brains/utils";
import type { BaseEntity, EntityAdapter } from "../types";
import {
  parseMarkdownWithFrontmatter,
  generateMarkdownWithFrontmatter,
  generateFrontmatter,
} from "../frontmatter";

export interface BaseEntityAdapterConfig<
  TEntity extends BaseEntity<TMetadata>,
  TMetadata,
> {
  entityType: string;
  schema: z.ZodSchema<TEntity>;
  frontmatterSchema: z.ZodObject<z.ZodRawShape>;
  isSingleton?: boolean;
  hasBody?: boolean;
  supportsCoverImage?: boolean;
}

/**
 * Abstract base class for entity adapters.
 *
 * Provides default implementations for the 3 boilerplate methods
 * (extractMetadata, parseFrontMatter, generateFrontMatter) and
 * protected helpers for common patterns in toMarkdown/fromMarkdown.
 *
 * Subclasses must implement toMarkdown() and fromMarkdown().
 */
export abstract class BaseEntityAdapter<
  TEntity extends BaseEntity<TMetadata>,
  TMetadata = Record<string, unknown>,
  TFrontmatter = TMetadata,
> implements EntityAdapter<TEntity, TMetadata>
{
  public readonly entityType: string;
  public readonly schema: z.ZodSchema<TEntity>;
  public readonly frontmatterSchema: z.ZodObject<z.ZodRawShape>;
  public readonly isSingleton?: boolean;
  public readonly hasBody?: boolean;
  public readonly supportsCoverImage?: boolean;

  // Stored separately with output type preserved for type-safe parsing.
  // ZodObject<ZodRawShape> erases the output type; this recovers it.
  private readonly fmSchema: z.ZodSchema<TFrontmatter>;

  constructor(config: BaseEntityAdapterConfig<TEntity, TMetadata>) {
    this.entityType = config.entityType;
    this.schema = config.schema;
    this.frontmatterSchema = config.frontmatterSchema;
    // ZodObject<ZodRawShape> erases the output type; recover it via cast.
    // Safe because the runtime object IS a ZodSchema<TFrontmatter>.
    this.fmSchema =
      config.frontmatterSchema as unknown as z.ZodSchema<TFrontmatter>;
    if (config.isSingleton !== undefined) this.isSingleton = config.isSingleton;
    if (config.hasBody !== undefined) this.hasBody = config.hasBody;
    if (config.supportsCoverImage !== undefined)
      this.supportsCoverImage = config.supportsCoverImage;
  }

  // ── Abstract methods (subclasses must implement) ──

  public abstract toMarkdown(entity: TEntity): string;
  public abstract fromMarkdown(markdown: string): Partial<TEntity>;

  // ── Default implementations (can be overridden) ──

  public extractMetadata(entity: TEntity): TMetadata {
    return entity.metadata;
  }

  public parseFrontMatter<T>(markdown: string, schema: z.ZodSchema<T>): T {
    return parseMarkdownWithFrontmatter(markdown, schema).metadata;
  }

  public generateFrontMatter(entity: TEntity): string {
    const metadata = entity.metadata as Record<string, unknown>;
    return generateFrontmatter(metadata);
  }

  // ── Protected helpers for use in toMarkdown/fromMarkdown ──

  /** Strip frontmatter and return the body content. */
  protected extractBody(markdown: string): string {
    try {
      return parseMarkdownWithFrontmatter(markdown, z.record(z.unknown()))
        .content;
    } catch {
      return markdown;
    }
  }

  /** Parse frontmatter using this adapter's frontmatter schema. */
  protected parseFrontmatter(markdown: string): TFrontmatter {
    return parseMarkdownWithFrontmatter(markdown, this.fmSchema).metadata;
  }

  /** Combine body and frontmatter into a markdown string. */
  protected buildMarkdown(
    body: string,
    frontmatter: Record<string, unknown>,
  ): string {
    return generateMarkdownWithFrontmatter(body, frontmatter);
  }
}
