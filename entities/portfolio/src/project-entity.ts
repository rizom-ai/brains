import { defineEntity, type EntityDefinition } from "@brains/plugins";
import { slugify } from "@brains/utils/string-utils";
import {
  projectFrontmatterSchema,
  projectMetadataSchema,
} from "./schemas/project";
import { getTemplates } from "./lib/templates";
import { projectDataSource } from "./datasources/project-datasource";
import { createProjectAtprotoProjection } from "./atproto-projection";
import {
  PROJECT_PRINTABLE_ATTACHMENT_TYPE,
  createProjectPrintableProvider,
} from "./attachments/printable-provider";
import {
  PROJECT_OG_IMAGE_ATTACHMENT_TYPE,
  createProjectOgImageProvider,
} from "./attachments/og-image-provider";
import { projectGeneration } from "./handlers/generation-handler";
import { projectEvals } from "./lib/eval-handlers";
import { PROJECT_CHANNELS } from "./project-channels";

/**
 * A portfolio project: a case study with context, problem, solution and
 * outcome, ordered by the year the work began.
 */
export const project: EntityDefinition<
  "project",
  typeof projectMetadataSchema
> = defineEntity({
  type: "project",
  purpose: "A portfolio case study for a piece of work.",
  metadata: projectMetadataSchema,
  config: { projectionSourceRole: "secondary" },
  markdown: {
    // Metadata indexes the queryable fields; description, coverImageId,
    // ogImageId and url stay in the content's frontmatter and are carried
    // forward on write.
    decode: ({ content, frontmatter }) => {
      const parsed = projectFrontmatterSchema.parse(frontmatter);
      return {
        content,
        metadata: {
          title: parsed.title,
          slug: parsed.slug ?? slugify(parsed.title),
          status: parsed.status,
          year: parsed.year,
          ...(parsed.publishedAt === undefined
            ? {}
            : { publishedAt: parsed.publishedAt }),
        },
      };
    },
    encode: ({ content, metadata }) => ({
      content,
      frontmatter: {
        title: metadata.title,
        slug: metadata.slug,
        status: metadata.status,
        year: metadata.year,
        ...(metadata.publishedAt === undefined
          ? {}
          : { publishedAt: metadata.publishedAt }),
      },
    }),
  },
  templates: getTemplates(),
  dataSources: [projectDataSource],
  attachments: [
    {
      type: PROJECT_PRINTABLE_ATTACHMENT_TYPE,
      provider: createProjectPrintableProvider,
    },
    {
      type: PROJECT_OG_IMAGE_ATTACHMENT_TYPE,
      provider: createProjectOgImageProvider,
    },
  ],
  atproto: createProjectAtprotoProjection(),
  generation: projectGeneration,
  evals: projectEvals,
  // A described project is generated; pasted content goes through ordinary
  // creation, and an upload is not a case study.
  create: {
    fromPrompt: { delegate: PROJECT_CHANNELS.generation },
  },
  // Projects publish to the site itself, so the provider records the
  // outcome and nothing more.
  publish: {
    provider: {
      name: "internal",
      publish: async (): Promise<{ id: string }> => ({ id: "internal" }),
    },
  },
});
