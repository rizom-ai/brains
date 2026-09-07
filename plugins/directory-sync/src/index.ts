import { directorySyncService } from "./service";

/**
 * Directory sync: the brain's records on disk and, when configured, in a
 * git checkout the broker owns.
 */
export {
  directorySyncService,
  DirectorySyncState,
  resolveRuntimeSyncPath,
  type DirectorySyncDeps,
} from "./service";
export type { DirectorySyncHost } from "./host";
export { DirectorySync } from "./lib/directory-sync";
export { DirectorySyncStatusFormatter } from "./formatters/directorySyncStatusFormatter";

/**
 * The broker child's entry points. The supervisor decides whether a broker
 * runs at all and where it listens, so it needs the socket-path rule and the
 * checkout rule without booting a Brain.
 */
export { startGitBrokerHost, resolveCheckoutPath } from "./lib/broker/host";
export type { GitBrokerHostOptions } from "./lib/broker/host";
export { gitBrokerSocketPath, GitBrokerServer } from "./lib/broker/server";
export {
  GIT_BROKER_CHECKOUT_ENV,
  GIT_BROKER_SOCKET_ENV,
} from "./lib/broker/connect";
export {
  BROKER_PROGRESS_TIMEOUT_MS,
  GIT_BROKER_TEST_PROGRESS_TIMEOUT_ENV,
  createBrokerHealthCheck,
  probeBrokerActivity,
  resolveBrokerProgressTimeoutMs,
} from "./lib/broker/health";
// Reaching a broker directly is what a recovery proof has to do: it observes
// the owner from outside rather than through a role that trusts it.
export { BrokerConnection } from "./lib/broker/client";
export { getGitRemoteFingerprint } from "./lib/git-options";

export type {
  CleanupResult,
  DirectorySyncConfig,
  DirectorySyncStatus,
  ExportResult,
  GitSyncStatus,
  ImportResult,
  PullResult,
  SyncResult,
  RawEntity,
  IDirectorySync,
  IGitSync,
  IFileOperations,
} from "./types";

export {
  directorySyncConfigSchema,
  directorySyncStatusSchema,
  exportResultSchema,
  importResultSchema,
  syncResultSchema,
} from "./schemas";

/** Directory sync as a brain composes it. */
const directorySyncPackage: ReturnType<typeof directorySyncService> =
  directorySyncService();
export default directorySyncPackage;
