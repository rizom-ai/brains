import {
  defineEntityPackage,
  type EntityPackageDefinition,
} from "@brains/sdk/entities";
import { docsConfigSchema } from "./config";
import { docDataSource } from "./datasources/doc-datasource";
import { doc } from "./doc";

/**
 * The docs: one entity, a doc, rendered by the docs templates through the
 * docs data source, which hands every page the configured hero and chrome.
 */
export const docsPackage: EntityPackageDefinition<
  readonly [typeof doc],
  readonly [],
  typeof docsConfigSchema
> = defineEntityPackage({
  id: "docs",
  config: docsConfigSchema,
  entities: [doc],
  configure: ({ config }) => ({ dataSources: [docDataSource(config)] }),
});

export default docsPackage;

export { doc } from "./doc";
export { docDataSource, parseDocData } from "./datasources/doc-datasource";
export { DocListTemplate, type DocListProps } from "./templates/doc-list";
export { DocDetailTemplate, type DocDetailProps } from "./templates/doc-detail";
export {
  docFrontmatterSchema,
  docMetadataSchema,
  docWithDataSchema,
  type DocFrontmatter,
  type DocMetadata,
  type DocWithData,
} from "./schemas/doc";
export {
  docsConfigSchema,
  docsHeroSchema,
  type DocsConfig,
  type DocsConfigInput,
  type DocsHero,
} from "./config";
