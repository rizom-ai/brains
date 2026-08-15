/**
 * Documentation entity package.
 *
 * A structured documentation page imported from repository markdown. The
 * body is the entity content; title, section, order, source path, and slug
 * are metadata decoded from frontmatter.
 *
 * Authored against the public declarative surface (`@brains/sdk/entities`).
 * A custom codec is needed because the slug falls back to a slugified title
 * when frontmatter does not pin one.
 */

import {
  defineEntity,
  defineEntityPackage,
  slugify,
  type EntityDefinition,
  type EntityOf,
  type EntityPackageDefinition,
} from "@brains/sdk/entities";
import {
  docFrontmatterSchema,
  docMetadataSchema,
  type DocFrontmatter,
} from "./schemas/doc";
import { docDataSource } from "./datasources/doc-datasource";
import { getTemplates } from "./lib/register-templates";

export const doc: EntityDefinition<"doc", typeof docMetadataSchema> =
  defineEntity({
    type: "doc",
    purpose: "A structured documentation page.",
    metadata: docMetadataSchema,
    markdown: {
      decode: ({ content, frontmatter }) => {
        const parsed: DocFrontmatter = docFrontmatterSchema.parse(frontmatter);
        return {
          content,
          metadata: {
            title: parsed.title,
            section: parsed.section,
            order: parsed.order,
            sourcePath: parsed.sourcePath,
            description: parsed.description,
            slug: parsed.slug ?? slugify(parsed.title),
          },
        };
      },
      encode: ({ content, metadata }) => ({
        content,
        frontmatter: {
          title: metadata.title,
          section: metadata.section,
          order: metadata.order,
          sourcePath: metadata.sourcePath,
          description: metadata.description,
          slug: metadata.slug,
        },
      }),
    },
    config: { projectionSourceRole: "primary" },
    templates: getTemplates(),
    dataSources: [docDataSource],
  });

export type Doc = EntityOf<typeof doc>;

const docPackage: EntityPackageDefinition<readonly [typeof doc], readonly []> =
  defineEntityPackage({
    id: "docs",
    entities: [doc],
  });

export default docPackage;

export { docDataSource, parseDocData } from "./datasources/doc-datasource";
export { DocListTemplate, type DocListProps } from "./templates/doc-list";
export { DocDetailTemplate, type DocDetailProps } from "./templates/doc-detail";
export {
  docSchema,
  docFrontmatterSchema,
  docMetadataSchema,
  docWithDataSchema,
  type DocFrontmatter,
  type DocMetadata,
  type DocWithData,
} from "./schemas/doc";
