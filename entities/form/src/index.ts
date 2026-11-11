import {
  formFrontmatterSchema,
  parseFormMarkdown,
  type FormFrontmatter,
} from "@brains/forms";
import {
  BaseEntityAdapter,
  EntityPlugin,
  baseEntityParserSchema,
  emptyEntityPluginConfigSchema,
  type EntityPluginContext,
  type EntityTypeConfig,
} from "@brains/plugins";
import { z } from "@brains/utils/zod";
import packageJson from "../package.json";

type FormMetadataSchema = z.ZodObject<{
  title: z.ZodString;
  target: z.ZodString;
  path: z.ZodString;
}>;
/** What forms are found by: the type their submissions become, and where. */
export const formMetadataSchema: FormMetadataSchema = z.object({
  title: z.string(),
  target: z.string(),
  path: z.string(),
});
export type FormMetadata = z.output<typeof formMetadataSchema>;

export const formEntitySchema: ReturnType<
  typeof baseEntityParserSchema.extend<{
    entityType: z.ZodLiteral<"form">;
    metadata: FormMetadataSchema;
  }>
> = baseEntityParserSchema.extend({
  entityType: z.literal("form"),
  metadata: formMetadataSchema,
});
export type FormEntity = z.output<typeof formEntitySchema>;

export class FormAdapter extends BaseEntityAdapter<
  FormEntity,
  FormMetadata,
  FormFrontmatter
> {
  constructor() {
    super({
      entityType: "form",
      purpose:
        "A public form on the brain's site: its fields, copy and what its submissions become. Served by the package that stores them; never knowledge or model input.",
      schema: formEntitySchema,
      frontmatterSchema: formFrontmatterSchema,
      hasBody: true,
    });
  }

  fromMarkdown(markdown: string): Partial<FormEntity> {
    const frontmatter = this.parseFrontMatter(markdown, formFrontmatterSchema);
    return {
      entityType: "form",
      content: markdown,
      metadata: {
        title: frontmatter.title,
        target: frontmatter.target,
        path: frontmatter.path ?? "",
      },
    };
  }
}
export const formAdapter: FormAdapter = new FormAdapter();

/** The `form` type. A form is served by the package its target belongs to;
 * installing this alone serves nothing. */
export class FormEntityPlugin extends EntityPlugin<
  FormEntity,
  Record<string, never>,
  Record<string, never>
> {
  readonly entityType = "form" as const;
  readonly schema: typeof formEntitySchema = formEntitySchema;
  readonly adapter: FormAdapter = formAdapter;

  constructor() {
    super("form", packageJson, {}, emptyEntityPluginConfigSchema);
  }

  protected override getEntityTypeConfig(): EntityTypeConfig {
    return {
      embeddable: false,
      fullTextSearchable: false,
      projectionSource: false,
      projectionSourceRole: "excluded",
    };
  }

  protected override async onRegister(
    context: EntityPluginContext,
  ): Promise<void> {
    await super.onRegister(context);
    context.entities.registerPersistValidator(
      this.entityType,
      async (entity) => {
        try {
          parseFormMarkdown(entity.id, entity.content);
        } catch {
          // The engine says why on import; never echo the definition here.
          throw new Error("Invalid form");
        }
      },
    );
  }
}

export function formPlugin(): FormEntityPlugin {
  return new FormEntityPlugin();
}
