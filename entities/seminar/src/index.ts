import { seminarPackage } from "./plugin";

export {
  seminarConfigSchema,
  seminarPackage,
  type SeminarConfig,
} from "./plugin";
export { seminar } from "./seminar-entity";
export {
  holdSeminar,
  seminarHoldJob,
  seminarHoldJobSchema,
} from "./handlers/seminar-hold-handler";
export type {
  SeminarHoldDeps,
  SeminarHoldJobData,
  SeminarHoldResult,
  SeminarPeer,
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
