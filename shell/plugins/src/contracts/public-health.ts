import { z } from "@brains/utils/zod";
import type { AppInfo } from "./app-info";
import { backgroundWorkInfoSchema } from "./runtime-app-info";

/**
 * A daemon's state as a caller without a session may see it. The message and
 * details a daemon reports stay out: they carry URLs (the webserver names its
 * admin-only preview host) and raw error text.
 */
export const publicDaemonHealthSchema: z.ZodObject<{
  name: z.ZodString;
  pluginId: z.ZodString;
  status: z.ZodString;
  health: z.ZodOptional<
    z.ZodObject<{
      status: z.ZodEnum<{
        healthy: "healthy";
        warning: "warning";
        error: "error";
        unknown: "unknown";
      }>;
      lastCheck: z.ZodOptional<z.ZodString>;
    }>
  >;
}> = z.object({
  name: z.string(),
  pluginId: z.string(),
  status: z.string(),
  health: z
    .object({
      status: z.enum(["healthy", "warning", "error", "unknown"]),
      lastCheck: z.string().optional(),
    })
    .optional(),
});

export type PublicDaemonHealth = z.output<typeof publicDaemonHealthSchema>;

/**
 * Every runtime health field a caller without a session may see. Entry
 * counts, entity and embedding totals, models, endpoints and interactions are
 * operator data and stay on authenticated surfaces.
 */
const publicHealthFieldsSchema = z.object({
  version: z.string(),
  uptime: z.number(),
  backgroundWork: backgroundWorkInfoSchema,
  daemons: z.array(publicDaemonHealthSchema),
});

/**
 * The app half of the unauthenticated `/health/operate` response. Background
 * work is left to the readiness half of the same response, which reports it
 * as worker, queue and lease checks.
 */
export const publicHealthInfoSchema: z.ZodObject<{
  version: z.ZodString;
  uptime: z.ZodNumber;
  daemons: z.ZodArray<typeof publicDaemonHealthSchema>;
}> = publicHealthFieldsSchema.omit({ backgroundWork: true });

export type PublicHealthInfo = z.output<typeof publicHealthInfoSchema>;

/**
 * `system_status` for a public caller. Daemons stay out of that tool at every
 * level, so its output stays compact and stable across calls.
 */
export const publicStatusInfoSchema: z.ZodObject<{
  version: z.ZodString;
  uptime: z.ZodNumber;
  backgroundWork: typeof backgroundWorkInfoSchema;
}> = publicHealthFieldsSchema.omit({ daemons: true });

export type PublicStatusInfo = z.output<typeof publicStatusInfoSchema>;

function toPublicDaemonHealth(
  daemon: AppInfo["daemons"][number],
): PublicDaemonHealth {
  const { name, pluginId, status, health } = daemon;
  return {
    name,
    pluginId,
    status,
    ...(health && {
      health: {
        status: health.status,
        ...(health.lastCheck !== undefined && { lastCheck: health.lastCheck }),
      },
    }),
  };
}

export function toPublicHealthInfo(info: AppInfo): PublicHealthInfo {
  return {
    version: info.version,
    uptime: info.uptime,
    daemons: info.daemons.map(toPublicDaemonHealth),
  };
}
