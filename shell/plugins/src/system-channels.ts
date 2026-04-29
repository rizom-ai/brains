/**
 * Internal shell coordination channel names.
 *
 * The wire values are kept stable for backward compatibility with existing
 * plugins/tests, even when the semantic names are more precise than the
 * historical message names.
 */
export const SYSTEM_CHANNELS = {
  /** Emitted after every plugin has completed registration. */
  pluginsRegistered: "system:plugins:ready",
  /** Emitted by directory-sync after startup import has completed. */
  initialSyncCompleted: "sync:initial:completed",
} as const;

export type SystemChannelName =
  (typeof SYSTEM_CHANNELS)[keyof typeof SYSTEM_CHANNELS];
