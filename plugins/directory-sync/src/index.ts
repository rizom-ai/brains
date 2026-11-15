/**
 * Directory sync plugin for Brains
 * Provides file-based entity synchronization
 */

import { createDirectorySyncPackage } from "./plugin";

export {
  createDirectorySyncPackage,
  type DirectorySyncDeps,
  type DirectorySyncState,
} from "./plugin";
export { DirectorySyncService, resolveRuntimeSyncPath } from "./service";

/** Directory sync, as a brain composes it. */
const directorySyncPackage: ReturnType<typeof createDirectorySyncPackage> =
  createDirectorySyncPackage();
export default directorySyncPackage;
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
  createBrokerHealthCheck,
  probeBrokerActivity,
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
