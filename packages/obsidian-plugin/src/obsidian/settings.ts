import { z } from "@brains/utils/zod";
import { parseState, type SyncState } from "../engine";

type SettingsSchema = z.ZodObject<{
  address: z.ZodDefault<z.ZodString>;
  username: z.ZodDefault<z.ZodString>;
  password: z.ZodDefault<z.ZodString>;
  syncOnSave: z.ZodDefault<z.ZodBoolean>;
  intervalMinutes: z.ZodDefault<z.ZodNumber>;
}>;

export const settingsSchema: SettingsSchema = z.object({
  /** The brain's address, as the person typed it. */
  address: z.string().default(""),
  username: z.string().default(""),
  password: z.string().default(""),
  /** Upload a note a few seconds after it was saved. */
  syncOnSave: z.boolean().default(true),
  /** How often a full sync runs. */
  intervalMinutes: z.number().int().min(1).max(60).default(5),
});

export type BrainSyncSettings = z.output<SettingsSchema>;

export interface PluginData {
  settings: BrainSyncSettings;
  state: SyncState;
}

/** The plugin's stored data, with defaults for what is missing. */
export function parsePluginData(value: unknown): PluginData {
  const stored = z
    .object({ settings: z.unknown(), state: z.unknown() })
    .partial()
    .safeParse(value ?? {});
  const record = stored.success ? stored.data : {};
  const settings = settingsSchema.safeParse(record.settings ?? {});
  return {
    settings: settings.success ? settings.data : settingsSchema.parse({}),
    state: parseState(record.state),
  };
}
