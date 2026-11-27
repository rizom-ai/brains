import { seminarPackage } from "./plugin";

export { seminarPackage } from "./plugin";
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
export { closingLines, openingMessage } from "./lib/messages";
export {
  readSeminar,
  readSeminarBody,
  seminarBody,
  seminarBodyCodec,
  seminarRecord,
  type SeminarParts,
} from "./lib/seminar-body";
export {
  seminarBodySchema,
  seminarFrontmatterSchema,
  seminarMetadataSchema,
  seminarRoundSchema,
  seminarSchema,
  seminarStatusSchema,
  seminarTurnSchema,
} from "./schemas/seminar";
export type {
  SeminarBody,
  SeminarEntity,
  SeminarFrontmatter,
  SeminarMetadata,
  SeminarRound,
  SeminarStatus,
  SeminarTurn,
} from "./schemas/seminar";

export default seminarPackage;
