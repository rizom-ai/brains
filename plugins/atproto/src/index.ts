import { createAtprotoPackage } from "./package";

export {
  createAtprotoPackage,
  type AtprotoPackageDeps,
  type AtprotoState,
} from "./package";
export type { AtprotoContext } from "./atproto-context";
export {
  AtprotoService,
  type AtprotoPluginDeps,
  type PublishBrainCardOptions,
  type PublishBrainCardResult,
  type PublishEntityOptions,
  type PublishEntityResult,
  type PublishPostOptions,
  type PublishPostResult,
  ATPROTO_PUBLISH_FAILED,
  atprotoPublishFailedChannel,
  atprotoPublishFailedPayloadSchema,
  type AtprotoPublishOperation,
  type AtprotoPublishFailedPayload,
  type DiscoverBrainCardsOptions,
  type DiscoverBrainCardResult,
  type DiscoverBrainCardsResult,
} from "./plugin";
export {
  atprotoConfigSchema,
  atprotoJetstreamConfigSchema,
  type AtprotoConfig,
  type AtprotoConfigInput,
  type AtprotoJetstreamConfig,
  type AtprotoJetstreamConfigInput,
} from "./config";
export {
  AtprotoProjectionRegistry,
  canonicalAtprotoLexicons,
  getCanonicalAtprotoLexicon,
  listCanonicalAtprotoLexicons,
  parseAtprotoLexicon,
  validateAtprotoRecord,
  type AtprotoProjectedPostRecord,
  type AtprotoProjection,
  type AtprotoProjectionBuildInput,
  type AtprotoProjectionPublishedInput,
  type AtprotoLexicon,
  type AtprotoLexiconRecordDef,
  type AtprotoLexiconProperty,
  type AtprotoPdsClientLike,
  type AtprotoBlobRef,
  type CanonicalAtprotoLexiconId,
} from "@brains/atproto-contracts";
export { buildBrainCardRecord, type BrainCardRecord } from "./records";
export {
  anchorDidWebFromHostname,
  buildConfiguredDidWebDocuments,
  buildConventionalDidWebDocuments,
  buildDidWebDocument,
  didWebFromHostname,
  didWebToDocumentPath,
  didWebToHostname,
  isDidWeb,
  normalizeServiceEndpoint,
  type ConfiguredDidWebDocument,
  type DidDocument,
  type DidDocumentService,
} from "./did";
export {
  AtprotoPdsClient,
  type AtprotoPdsClientConfig,
  type AtprotoSession,
  type CreateRecordInput,
  type CreateRecordResult,
  type PutRecordInput,
  type PutRecordResult,
  type GetRecordInput,
  type GetRecordResult,
  type DeleteRecordInput,
  type UploadBlobInput,
  type UploadBlobResult,
} from "./pds-client";

/** The brain on the AT Protocol, as a brain composes it. */
const atprotoPackage: ReturnType<typeof createAtprotoPackage> =
  createAtprotoPackage();
export default atprotoPackage;
