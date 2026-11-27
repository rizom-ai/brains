import { seminarPackage } from "./plugin";

export {
  seminarConfigSchema,
  seminarPackage,
  type SeminarConfig,
} from "./plugin";
export { seminar } from "./seminar-entity";
export { getTemplates } from "./lib/register-templates";
export {
  seminarAskDataSource,
  seminarAskPage,
  seminarAskPageSchema,
} from "./datasources/seminar-ask-datasource";
export type {
  SeminarAskBuild,
  SeminarAskPage,
  SeminarAskSources,
} from "./datasources/seminar-ask-datasource";
export {
  SeminarAskTemplate,
  type SeminarAskProps,
} from "./templates/seminar-ask";
export {
  SeminarDetailTemplate,
  type SeminarDetailProps,
} from "./templates/seminar-detail";
export {
  SeminarListTemplate,
  type SeminarListProps,
} from "./templates/seminar-list";
export {
  seminarDataSource,
  seminarPageOf,
  seminarDetailPageSchema,
  seminarListPageSchema,
  seminarPageSchema,
  seminarPageSourceSchema,
  seminarPageTurnSchema,
} from "./datasources/seminar-datasource";
export type {
  SeminarDetailPage,
  SeminarListPage,
  SeminarPage,
  SeminarPageTurn,
  ShownPeer,
} from "./datasources/seminar-datasource";
export {
  holdSeminar,
  seminarHoldJob,
  seminarHoldJobSchema,
} from "./handlers/seminar-hold-handler";
export {
  redoSeminar,
  seminarRedoFromSchema,
  seminarRedoJob,
  seminarRedoJobSchema,
} from "./handlers/seminar-redo-handler";
export type {
  SeminarRedoDeps,
  SeminarRedoFrom,
  SeminarRedoJobData,
  SeminarRedoResult,
  StoredSeminar,
} from "./handlers/seminar-redo-handler";
export type {
  SeminarHoldDeps,
  SeminarHoldJobData,
  SeminarHoldResult,
  SeminarPeer,
  SeminarTurnDeps,
} from "./handlers/seminar-hold-handler";
export {
  chairChallengePrompt,
  chairChallengeSchema,
  chairClosingPrompt,
  chairClosingSchema,
  chairRejoinderPrompt,
  checkedChallenge,
  checkedClosing,
  modelChair,
} from "./lib/chair";
export type {
  ChairChallenge,
  ChairChallengeInput,
  ChairClosing,
  ChairClosingInput,
  ChairReading,
  ChairRejoinderInput,
  SeminarChair,
} from "./lib/chair";
export {
  challengeMessage,
  closingLines,
  openingMessage,
  rejoinderMessage,
  type QuotedTurn,
} from "./lib/messages";
export {
  readSeminar,
  readSeminarBody,
  seminarBody,
  seminarBodyCodec,
  seminarRecord,
  type SeminarParts,
} from "./lib/seminar-body";
export {
  CHAIR,
  seminarBodySchema,
  seminarClosingSchema,
  seminarFrontmatterSchema,
  seminarMetadataSchema,
  seminarRoundSchema,
  seminarSchema,
  seminarStatusSchema,
  seminarTurnSchema,
} from "./schemas/seminar";
export type {
  SeminarBody,
  SeminarClosing,
  SeminarEntity,
  SeminarFrontmatter,
  SeminarMetadata,
  SeminarRound,
  SeminarStatus,
  SeminarTurn,
} from "./schemas/seminar";

export default seminarPackage;
