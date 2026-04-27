export { DocsPlugin, docsPlugin } from "./plugin";
export { DocAdapter, docAdapter } from "./adapters/doc-adapter";
export { DocDataSource, parseDocData } from "./datasources/doc-datasource";
export { DocListTemplate, type DocListProps } from "./templates/doc-list";
export { DocDetailTemplate, type DocDetailProps } from "./templates/doc-detail";
export {
  docSchema,
  docFrontmatterSchema,
  docMetadataSchema,
  docWithDataSchema,
  type Doc,
  type DocFrontmatter,
  type DocMetadata,
  type DocWithData,
} from "./schemas/doc";
