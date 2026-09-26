import { atprotoService } from "./service";

export { atprotoService } from "./service";
export {
  createAtprotoPublisher,
  type AtprotoAnnouncer,
  type AtprotoEntityReads,
  type AtprotoPublisher,
  type AtprotoPublisherInput,
  type AtprotoServiceDeps,
} from "./publisher";
export * from "./publish-contracts";
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
export {
  buildBrainCardRecord,
  type AtprotoBrainSource,
  type BrainCardRecord,
} from "./records";
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

/** The service with its production collaborators, for a brain's composition. */
const atprotoPackage: ReturnType<typeof atprotoService> = atprotoService();
export default atprotoPackage;
