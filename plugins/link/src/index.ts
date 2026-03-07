// Plugin exports
export { LinkPlugin, createLinkPlugin, linkPlugin } from "./plugin";

// Schema and type exports
export type {
  LinkConfig,
  LinkEntity,
  LinkFrontmatter,
  LinkSource,
  LinkStatus,
  LinkMetadata,
} from "./schemas/link";
export {
  linkSchema,
  linkFrontmatterSchema,
  linkSourceSchema,
  linkStatusSchema,
  linkMetadataSchema,
  linkConfigSchema,
} from "./schemas/link";

// Adapter exports
export { LinkAdapter } from "./adapters/link-adapter";

// Service exports
export { LinkService } from "./lib/link-service";
