import { z } from "@brains/utils/zod";
import { driveUrl, emptyState, parseState, type SyncState } from "../engine";

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
  /** How often everything is compared; changes arrive as they happen in between. */
  intervalMinutes: z.number().int().min(1).max(60).default(30),
});

export type RizomBrainSettings = z.output<SettingsSchema>;

export interface PluginData {
  settings: RizomBrainSettings;
  /** Each brain's sync state, by its drive address. */
  states: Record<string, SyncState>;
}

/** A brain's drive address, however it was typed; "" when it is not one. */
export function addressKey(address: string): string {
  if (address.trim() === "") return "";
  try {
    return driveUrl(address).href;
  } catch {
    // An address being typed is not one yet.
    return "";
  }
}

/**
 * The sync state of the brain an address names. Each brain keeps its own:
 * editing the address and back never loses one.
 */
export function stateFor(data: PluginData, address: string): SyncState {
  const key = addressKey(address);
  return structuredClone(data.states[key] ?? emptyState(key));
}

export function withState(
  data: PluginData,
  key: string,
  state: SyncState,
): PluginData {
  return { ...data, states: { ...data.states, [key]: structuredClone(state) } };
}

/** The plugin's stored data, with defaults for what is missing. */
export function parsePluginData(value: unknown): PluginData {
  const stored = z
    .object({ settings: z.unknown(), states: z.unknown() })
    .partial()
    .safeParse(value ?? {});
  const record = stored.success ? stored.data : {};
  const settings = settingsSchema.safeParse(record.settings ?? {});
  const states = z
    .record(z.string(), z.unknown())
    .safeParse(record.states ?? {});
  return {
    settings: settings.success ? settings.data : settingsSchema.parse({}),
    states: Object.fromEntries(
      Object.entries(states.success ? states.data : {}).map(([key, state]) => [
        key,
        parseState(state),
      ]),
    ),
  };
}
