export {
  AtprotoPlugin,
  atprotoPlugin,
  atprotoPlugin as plugin,
  type AtprotoPluginDeps,
  type PublishBrainCardOptions,
  type PublishBrainCardResult,
  type PublishEntityOptions,
  type PublishEntityResult,
  type PublishPostOptions,
  type PublishPostResult,
} from "./plugin";
export {
  atprotoConfigSchema,
  type AtprotoConfig,
  type AtprotoConfigInput,
} from "./config";
export {
  AtprotoProjectionRegistry,
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
} from "@brains/atproto-contracts";
export { buildBrainCardRecord, type BrainCardRecord } from "./records";
export {
  buildDidWebDocument,
  didWebToHostname,
  isDidWeb,
  normalizeServiceEndpoint,
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
  type UploadBlobInput,
  type UploadBlobResult,
} from "./pds-client";
