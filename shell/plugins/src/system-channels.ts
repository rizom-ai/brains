import { defineChannel, type Channel } from "@brains/contracts";
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

type InitialSyncOutcomeSchema = z.ZodDiscriminatedUnion<
  [
    z.ZodObject<{ success: z.ZodLiteral<true> }>,
    z.ZodObject<{ success: z.ZodLiteral<false>; error: z.ZodString }>,
  ]
>;

/** How the startup import ended: imported, or failed with its reason. */
export const initialSyncOutcomeSchema: InitialSyncOutcomeSchema =
  z.discriminatedUnion("success", [
    z.object({ success: z.literal(true) }),
    z.object({ success: z.literal(false), error: z.string() }),
  ]);

export type InitialSyncOutcome = z.output<typeof initialSyncOutcomeSchema>;

/** Broadcast by directory-sync once its startup import has settled. */
export const initialSyncCompletedChannel: Channel<
  InitialSyncOutcome,
  unknown,
  typeof SYSTEM_CHANNELS.initialSyncCompleted
> = defineChannel(
  SYSTEM_CHANNELS.initialSyncCompleted,
  initialSyncOutcomeSchema,
);

type SystemTimestampSchema = z.ZodObject<{ timestamp: z.ZodString }>;

/** When a lifecycle point was reached, and nothing else. */
const systemTimestampSchema: SystemTimestampSchema = z.object({
  timestamp: z.string(),
});

export type SystemTimestamp = z.output<typeof systemTimestampSchema>;

/** Broadcast by the shell once startup content is in place. */
export const startupContentSettledChannel: Channel<
  SystemTimestamp,
  unknown,
  typeof SYSTEM_CHANNELS.startupContentSettled
> = defineChannel(SYSTEM_CHANNELS.startupContentSettled, systemTimestampSchema);

/** Broadcast by the shell once boot completes. */
export const shellReadyChannel: Channel<
  SystemTimestamp,
  unknown,
  typeof SYSTEM_CHANNELS.shellReady
> = defineChannel(SYSTEM_CHANNELS.shellReady, systemTimestampSchema);

type IdentityChangedSchema = z.ZodObject<{ entityType: z.ZodString }>;

/** Which identity entity changed: the brain character or the anchor profile. */
export const identityChangedSchema: IdentityChangedSchema = z.object({
  entityType: z.string().min(1),
});

export type IdentityChanged = z.output<typeof identityChangedSchema>;

/** Broadcast by the shell once its identity caches hold the new values. */
export const identityChangedChannel: Channel<
  IdentityChanged,
  unknown,
  typeof SYSTEM_CHANNELS.identityChanged
> = defineChannel(SYSTEM_CHANNELS.identityChanged, identityChangedSchema);
