import { parseMarkdownWithFrontmatter } from "@brains/plugins";
import { canonicalAtprotoLexicons } from "@brains/atproto-contracts";
import type {
  AtprotoProjection,
  AtprotoProjectionBuildInput,
} from "@brains/atproto-contracts";
import { projectFrontmatterSchema, projectSchema } from "./schemas/project";

export interface ProjectAtprotoRecord {
  [key: string]: unknown;
  $type: "ai.rizom.brain.project";
  title: string;
  slug?: string;
  description?: string;
  body: string;
  format: "text/markdown";
  year: number;
  url?: string;
  publishedAt?: string;
  brainDid?: string;
  anchorDid?: string;
  sourceEntityType: "project";
  sourceEntityId: string;
  createdAt: string;
  updatedAt?: string;
}

export async function buildProjectAtprotoRecord({
  entity,
  config,
}: AtprotoProjectionBuildInput): Promise<ProjectAtprotoRecord> {
  const project = projectSchema.parse(entity);
  const parsed = parseMarkdownWithFrontmatter(
    project.content,
    projectFrontmatterSchema,
  );
  const frontmatter = parsed.metadata;

  return {
    $type: "ai.rizom.brain.project",
    title: frontmatter.title,
    ...(frontmatter.slug && { slug: frontmatter.slug }),
    description: frontmatter.description,
    body: parsed.content,
    format: "text/markdown",
    year: frontmatter.year,
    ...(frontmatter.url && { url: frontmatter.url }),
    ...(frontmatter.publishedAt && { publishedAt: frontmatter.publishedAt }),
    ...(config.brainDid && { brainDid: config.brainDid }),
    ...(config.anchorDid && { anchorDid: config.anchorDid }),
    sourceEntityType: "project",
    sourceEntityId: project.id,
    createdAt: project.created,
    ...(project.updated && { updatedAt: project.updated }),
  };
}

export function createProjectAtprotoProjection(): AtprotoProjection<ProjectAtprotoRecord> {
  return {
    entityType: "project",
    collection: "ai.rizom.brain.project",
    lexicon: canonicalAtprotoLexicons["ai.rizom.brain.project"],
    validate: false,
    buildRecord: buildProjectAtprotoRecord,
  };
}
