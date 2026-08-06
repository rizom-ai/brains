import {
  ProjectionJsonObjectSchema,
  defineProjectionRule,
  type BaseEntity,
  type ProjectionRule,
  type ProjectionWriteIntent,
} from "@brains/plugins";
import { formatVoiceGuidance, styleGuideAdapter } from "@brains/style-guide";
import { slugify } from "@brains/utils/string-utils";
import { z } from "@brains/utils/zod";
import { socialPostAdapter } from "../adapters/social-post-adapter";
import type { SocialPost } from "../schemas/social-post";
import {
  linkedinPostSchema,
  linkedinTemplate,
} from "../templates/linkedin-template";
import { SOCIAL_POST_GENERATION_PROJECTION_ID } from "../social-channels";

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

function toSourcePost(
  entity: BaseEntity,
): z.output<typeof sourcePostSchema> | null {
  const metadata = postMetadataSchema.parse(entity.metadata);
  if (metadata.status !== "queued") return null;
  return {
    id: entity.id,
    content: entity.content,
    title: metadata.title ?? entity.id,
    slug: metadata.slug ?? entity.id,
    visibility: entity.visibility,
  };
}

async function selectSocialPostInput(
  context: Parameters<ProjectionRule["selectInput"]>[1],
): Promise<SocialPostProjectionInput> {
  const [
    posts,
    existingSocialPosts,
    styleGuideEntity,
    templatePrompt,
    appInfo,
  ] = await Promise.all([
    context.entities.listEntities({ entityType: "post" }),
    context.entities.listEntities<SocialPost>({
      entityType: "social-post",
    }),
    context.entities.getEntity({
      entityType: "style-guide",
      id: "style-guide",
    }),
    context.resolvePrompt(
      linkedinTemplate.name,
      linkedinTemplate.basePrompt ?? "",
    ),
    context.appInfo(),
  ]);

  const sources = posts
    .map(toSourcePost)
    .filter((post): post is NonNullable<typeof post> => post !== null)
    .sort((left, right) => left.id.localeCompare(right.id));
  const existingSourceIds = existingSocialPosts
    .flatMap((entity) => {
      const frontmatter =
        socialPostAdapter.parsePostFrontmatter(entity).sourceEntityId;
      return frontmatter ? [frontmatter] : [];
    })
    .sort();
  const voiceGuidance = styleGuideEntity
    ? formatVoiceGuidance(
        styleGuideAdapter.parseStyleGuide(styleGuideEntity.content),
      )
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
): Promise<readonly ProjectionWriteIntent[]> {
  const existingSourceIds = new Set(input.existingSourceIds);
  const intents: ProjectionWriteIntent[] = [];

  for (const source of input.sources) {
    if (signal.aborted) throw signal.reason;
    if (existingSourceIds.has(source.id)) continue;

    const generated = linkedinPostSchema.parse(
      await context.ai.generate({
        prompt: `Create an engaging linkedin post to promote this post:\n\nSource: post/${source.slug}\n\n${source.content}`,
        templateName: linkedinTemplate.name,
        representedIdentity: "anchor",
        ...(input.voiceGuidance && {
          styleGuide: { voice: input.voiceGuidance },
        }),
      }),
    );
    const id = `linkedin-${source.id}`;
    const slug = `linkedin-${slugify(generated.title)}`;
    const content = socialPostAdapter.createPostContent(
      {
        title: generated.title,
        platform: "linkedin",
        status: "draft",
        sourceEntityType: "post",
        sourceEntityId: source.id,
      },
      generated.content,
    );

    intents.push({
      operation: "upsert",
      entity: {
        id,
        entityType: "social-post",
        content,
        metadata: {
          title: generated.title,
          platform: "linkedin",
          status: "draft",
          slug,
        },
        visibility: source.visibility,
      },
    });
    existingSourceIds.add(source.id);
  }

  return intents;
}

export function createSocialPostProjectionRule(): ProjectionRule {
  return defineProjectionRule({
    id: SOCIAL_POST_GENERATION_PROJECTION_ID,
    version: "1",
    sources: [{ kind: "entity", types: ["post"] }],
    targetType: "social-post",
    inputSchema: socialPostProjectionInputSchema,
    selectInput: async (_trigger, context) => selectSocialPostInput(context),
    derive: deriveSocialPosts,
  });
}
