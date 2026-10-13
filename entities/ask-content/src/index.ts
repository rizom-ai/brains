import {
  askContentFrontmatterSchema,
  parseAskContent,
  type AskContent,
  type AskContentFrontmatter,
} from "@brains/contracts";
import {
  BaseEntityAdapter,
  EntityPlugin,
  baseEntityParserSchema,
  emptyEntityPluginConfigSchema,
  type EntityTypeConfig,
  type Plugin,
} from "@brains/plugins";
import { z } from "@brains/utils/zod";
import packageJson from "../package.json";

const metadataSchema: z.ZodObject<Record<string, never>> = z.object({});
export const askContentEntitySchema: ReturnType<
  typeof baseEntityParserSchema.extend<{
    id: z.ZodLiteral<"ask-content">;
    entityType: z.ZodLiteral<"ask-content">;
    metadata: typeof metadataSchema;
  }>
> = baseEntityParserSchema.extend({
  id: z.literal("ask-content"),
  entityType: z.literal("ask-content"),
  metadata: metadataSchema,
});
export type AskContentEntity = z.output<typeof askContentEntitySchema>;

export class AskContentAdapter extends BaseEntityAdapter<
  AskContentEntity,
  Record<string, never>,
  AskContentFrontmatter
> {
  constructor() {
    super({
      entityType: "ask-content",
      purpose:
        "Authored welcome and suggested topics shared by public Ask surfaces. Not model instructions or access policy.",
      schema: askContentEntitySchema,
      frontmatterSchema: askContentFrontmatterSchema,
      isSingleton: true,
      hasBody: true,
    });
  }
  createContent(frontmatter: AskContentFrontmatter, introduction = ""): string {
    return this.buildMarkdown(
      introduction,
      askContentFrontmatterSchema.parse(frontmatter),
    );
  }
  parseContent(content: string): AskContent {
    return parseAskContent(content);
  }
  fromMarkdown(markdown: string): Partial<AskContentEntity> {
    return { entityType: "ask-content", content: markdown };
  }
  override extractMetadata(_entity: AskContentEntity): Record<string, never> {
    return {};
  }
}
export const askContentAdapter: AskContentAdapter = new AskContentAdapter();

export class AskContentPlugin extends EntityPlugin<
  AskContentEntity,
  Record<string, never>,
  Record<string, never>
> {
  readonly entityType = "ask-content" as const;
  readonly schema: typeof askContentEntitySchema = askContentEntitySchema;
  readonly adapter: AskContentAdapter = askContentAdapter;
  constructor() {
    super("ask-content", packageJson, {}, emptyEntityPluginConfigSchema);
  }
  protected override getEntityTypeConfig(): EntityTypeConfig {
    return { embeddable: false };
  }
}
export function askContentPlugin(): Plugin {
  return new AskContentPlugin();
}
