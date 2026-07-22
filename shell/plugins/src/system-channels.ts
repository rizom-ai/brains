/**
 * Internal shell coordination channel names.
 *
 * Keep names aligned with their lifecycle timing: registration coordination is
 * not the same as ready-state preparation.
 */
export const SYSTEM_CHANNELS = {
  /** Emitted after every plugin has completed registration. */
  pluginsRegistered: "system:plugins:registered",
  /** Emitted by directory-sync after startup import has completed. */
  initialSyncCompleted: "sync:initial:completed",
} as const;

export type SystemChannelName =
  (typeof SYSTEM_CHANNELS)[keyof typeof SYSTEM_CHANNELS];
