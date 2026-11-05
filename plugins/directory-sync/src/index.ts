/**
 * Directory sync plugin for Brains
 * Provides file-based entity synchronization
 */

export { directorySync, directorySyncPlugin } from "./plugin";
export { DirectorySyncPlugin } from "./plugin";
export { DirectorySync } from "./lib/directory-sync";
export { DirectorySyncStatusFormatter } from "./formatters/directorySyncStatusFormatter";

/**
 * The supervisor decides whether a broker runs at all and where it listens, so
 * it needs the socket-path rule and the checkout rule without booting a Brain.
 * The broker endpoints themselves are in `@brains/directory-sync/broker-runtime`.
 */
export {
  gitBrokerRuntimeDir,
  gitBrokerSocketPath,
  resolveCheckoutPath,
} from "./lib/broker/paths";
export type { GitBrokerHostOptions } from "./lib/broker/host";
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
