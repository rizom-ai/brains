export { initPilotRepo } from "./init";
export {
  loadPilotRegistry,
  PilotRegistryError,
  type ExternalStatus,
  type SnapshotStatus,
  type ObservedUserStatus,
  type ResolvedCohort,
  type ResolvedUserIdentity,
  type ResolvedUser,
  type LoadPilotRegistryOptions,
  type PilotRegistry,
} from "./load-registry";
export { writeUsersTable } from "./render-users-table";
export { onboardUser } from "./onboard-user";
export { reconcileCohort } from "./reconcile-cohort";
export { reconcileAll } from "./reconcile-all";
export {
  findUser,
  findCohortUsers,
  findAllUsers,
  runUsers,
  type UserRunner,
  type UserRunResult,
} from "./reconcile-lib";
export { parseArgs, type ParsedArgs } from "./parse-args";
export { runCommand, type CommandResult } from "./run-command";
