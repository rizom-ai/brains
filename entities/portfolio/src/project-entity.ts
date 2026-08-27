import {
  defineEntity,
  frontmatterInContent,
  generateMarkdownWithFrontmatter,
  type EntityDefinition,
} from "@brains/sdk/entities";
import { slugify } from "@brains/sdk/entities";
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
  // What system_generate persists before the case study is written. A year
  // is required metadata, so the placeholder claims the current one until
  // generation works out the real one.
  stub: ({ id, title }) => {
    const year = new Date().getUTCFullYear();
    return {
      content: generateMarkdownWithFrontmatter("", {
        title,
        slug: id,
        status: "generating",
        description: "",
        year,
      }),
      metadata: { title, slug: id, status: "generating", year },
    };
  },
  // Metadata indexes the queryable fields; description, coverImageId,
  // ogImageId and url live in the file and are carried forward on write.
  // Spelled out by hand this dropped them — decode returned the body without
  // its frontmatter and encode re-emitted only the indexed fields.
  markdown: frontmatterInContent((frontmatter) => {
    const parsed = projectFrontmatterSchema.parse(frontmatter);
    return {
      title: parsed.title,
      slug: parsed.slug ?? slugify(parsed.title),
      status: parsed.status,
      year: parsed.year,
      ...(parsed.publishedAt === undefined
        ? {}
        : { publishedAt: parsed.publishedAt }),
    };
  }),
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
