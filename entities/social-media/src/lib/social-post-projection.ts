import type { BaseEntity } from "@brains/sdk/internal/entity-runtime";
import {
  ProjectionJsonObjectSchema,
  defineProjectionRule,
  type ProjectionRule,
  type ProjectionWriteIntent,
} from "@brains/sdk/entities";
import {
  formatVoiceGuidance,
  frontmatterRecordFields,
  styleGuideFromRecord,
} from "@brains/contracts";
import { z } from "@brains/utils/zod";
import {
  linkedinPostSchema,
  linkedinTemplate,
} from "../templates/linkedin-template";
import { SOCIAL_POST_GENERATION_PROJECTION_ID } from "../social-channels";
import type { SocialPostMetadata } from "../schemas/social-post";
import { socialPostDocument, socialPostSlug } from "./social-post-markdown";

const sourcePostSchema = z.object({
  id: z.string(),
  content: z.string(),
  title: z.string(),
  slug: z.string(),
  visibility: z.enum(["public", "shared", "restricted"]),
});

const socialPostProjectionInputSchema = z.object({
  sources: z.array(sourcePostSchema),
  existingSourceIds: z.array(z.string()),
  templatePrompt: z.string(),
  voiceGuidance: z.string(),
  model: z.string(),
  identity: ProjectionJsonObjectSchema,
});

type SocialPostProjectionInput = z.output<
  typeof socialPostProjectionInputSchema
>;

const postMetadataSchema = z.looseObject({
  title: z.string().optional(),
  slug: z.string().optional(),
  status: z.string().optional(),
});

const sourceFieldsSchema = z.looseObject({
  sourceEntityId: z.string().optional(),
});

/**
 * A queued blog post to share: its title and its text. A declared post
 * reads back as its body, its frontmatter its metadata; a stored document
 * carries its frontmatter in its content.
 */
function toSourcePost(
  entity: BaseEntity,
): z.output<typeof sourcePostSchema> | null {
  const metadata = postMetadataSchema.parse(entity.metadata);
  if (metadata.status !== "queued") return null;
  return {
    id: entity.id,
    content: frontmatterRecordFields(entity).body,
    title: metadata.title ?? entity.id,
    slug: metadata.slug ?? entity.id,
    visibility: entity.visibility,
  };
}

/** The post a social post was written from, as its file or record names it. */
function sourceEntityIdOf(entity: BaseEntity): string | undefined {
  const fields = sourceFieldsSchema.safeParse(
    frontmatterRecordFields(entity).fields,
  );
  return fields.success ? fields.data.sourceEntityId : undefined;
}

async function selectSocialPostInput(
  context: Parameters<ProjectionRule["selectInput"]>[1],
  templateName: string,
): Promise<SocialPostProjectionInput> {
  const [
    posts,
    existingSocialPosts,
    styleGuideEntity,
    templatePrompt,
    appInfo,
  ] = await Promise.all([
    context.entities.listEntities({ entityType: "post" }),
    context.entities.listEntities({ entityType: "social-post" }),
    context.entities.getEntity({
      entityType: "style-guide",
      id: "style-guide",
    }),
    context.resolvePrompt(templateName, linkedinTemplate.basePrompt ?? ""),
    context.appInfo(),
  ]);

  const sources = posts
    .map(toSourcePost)
    .filter((post): post is NonNullable<typeof post> => post !== null)
    .sort((left, right) => left.id.localeCompare(right.id));
  const existingSourceIds = existingSocialPosts
    .flatMap((entity) => {
      const sourceEntityId = sourceEntityIdOf(entity);
      return sourceEntityId ? [sourceEntityId] : [];
    })
    .sort();
  const voiceGuidance = styleGuideEntity
    ? formatVoiceGuidance(styleGuideFromRecord(styleGuideEntity))
    : "";

  return {
    sources,
    existingSourceIds: [...new Set(existingSourceIds)],
    templatePrompt,
    voiceGuidance,
    model: appInfo.ai.model,
    identity: context.identityInput(),
  };
}

async function deriveSocialPosts(
  input: SocialPostProjectionInput,
  context: Parameters<ProjectionRule["derive"]>[1],
  signal: AbortSignal,
  templateName: string,
): Promise<readonly ProjectionWriteIntent[]> {
  const existingSourceIds = new Set(input.existingSourceIds);
  const missing = input.sources.filter(
    (source) => !existingSourceIds.has(source.id),
  );
  const intents: ProjectionWriteIntent[] = [];
  // One at a time, in order, so a cancelled wave stops between posts.
  for (const source of missing) {
    if (signal.aborted) throw signal.reason;
    const generated = await context.ai.generate(
      {
        prompt: `Write a linkedin post to share this post:\n\nSource: post/${source.slug}\n\nTitle: ${source.title}\n\n${source.content}`,
        templateName,
        representedIdentity: "anchor",
        ...(input.voiceGuidance && {
          styleGuide: { voice: input.voiceGuidance },
        }),
      },
      linkedinPostSchema,
    );
    const metadata: SocialPostMetadata = {
      title: generated.title,
      platform: "linkedin",
      status: "draft",
      sourceEntityId: source.id,
      sourceEntityType: "post",
      slug: socialPostSlug("linkedin", generated.title),
    };
    intents.push({
      operation: "upsert",
      entity: {
        id: `linkedin-${source.id}`,
        entityType: "social-post",
        content: socialPostDocument({ content: generated.content, metadata }),
        metadata: ProjectionJsonObjectSchema.parse(metadata),
        visibility: source.visibility,
      },
    });
  }
  return intents;
}

/**
 * The rule that writes a LinkedIn draft for each queued blog post that has
 * none, through the type's LinkedIn template, named by its registered name.
 */
export function createSocialPostProjectionRule(
  templateName: string,
): ProjectionRule {
  return defineProjectionRule({
    id: SOCIAL_POST_GENERATION_PROJECTION_ID,
    version: "1",
    sources: [{ kind: "entity", types: ["post"] }],
    targetType: "social-post",
    inputSchema: socialPostProjectionInputSchema,
    selectInput: async (_trigger, context) =>
      selectSocialPostInput(context, templateName),
    derive: (input, context, signal) =>
      deriveSocialPosts(input, context, signal, templateName),
  });
}
