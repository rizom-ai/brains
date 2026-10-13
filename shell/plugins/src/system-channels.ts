import { z } from "@brains/utils/zod";

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
  /**
   * Emitted once startup content is in place — after a pending initial sync
   * completed or failed, or at boot when none was pending — and the shell's
   * ready-state defaults exist. Seed defaults here, never earlier.
   */
  startupContentSettled: "system:startup-content:settled",
  /** Emitted after shell boot completes and guarded shell APIs are available. */
  shellReady: "system:shell:ready",
  /**
   * Emitted after the brain character or anchor profile changed and the
   * shell's identity caches hold the new values. React to identity here,
   * not to the raw entity events, which race the cache refresh.
   */
  identityChanged: "system:identity:changed",
} as const;

export type SystemChannelName =
  (typeof SYSTEM_CHANNELS)[keyof typeof SYSTEM_CHANNELS];

type PluginsRegisteredAnswerSchema = z.ZodObject<{
  initialSyncPending: z.ZodBoolean;
}>;

/**
 * A pluginsRegistered subscriber's answer when it has queued startup content
 * still to import; it then sends initialSyncCompleted once that settles.
 */
export const pluginsRegisteredAnswerSchema: PluginsRegisteredAnswerSchema =
  z.object({ initialSyncPending: z.boolean() });

export type PluginsRegisteredAnswer = z.output<
  typeof pluginsRegisteredAnswerSchema
>;
