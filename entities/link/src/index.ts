// Plugin exports
export { LinkPlugin, createLinkPlugin, linkPlugin } from "./plugin";
export {
  buildLinkAtprotoRecord,
  createLinkAtprotoProjection,
} from "./atproto-projection";

// Schema and type exports
export type {
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
} from "./schemas/link";
export { linkConfigSchema } from "./schemas/link-config";
export type { LinkConfig, LinkConfigInput } from "./schemas/link-config";

// Adapter exports
export { LinkAdapter, linkAdapter } from "./adapters/link-adapter";

// Service exports
export { LinkService } from "./lib/link-service";
