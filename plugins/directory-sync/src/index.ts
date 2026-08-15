/**
 * Directory sync plugin for Brains
 * Provides file-based entity synchronization
 */

export { directorySync, directorySyncPlugin } from "./plugin";
export { DirectorySyncPlugin } from "./plugin";
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
export { GIT_BROKER_SOCKET_ENV } from "./lib/broker/connect";
export {
  BROKER_PROGRESS_TIMEOUT_MS,
  createBrokerHealthCheck,
  probeBrokerActivity,
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
