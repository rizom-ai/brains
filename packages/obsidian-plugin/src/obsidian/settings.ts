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
  /** The app password. Kept in Obsidian's secret store, never in the data file. */
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

/** What the plugin's data file holds: everything but the app password. */
export interface StoredPluginData {
  settings: Omit<RizomBrainSettings, "password">;
  states: Record<string, SyncState>;
}

/** The name the app password has in Obsidian's secret store. */
export const PASSWORD_SECRET = "rizom-brain-app-password";

/** Obsidian's secret store (`app.secretStorage`), as far as it is used. */
export interface SecretStore {
  getSecret(id: string): string | null;
  setSecret(id: string, secret: string): void;
}

/** Put the app password in the secret store, when it is not there already. */
export function keepPassword(secrets: SecretStore, password: string): void {
  if ((secrets.getSecret(PASSWORD_SECRET) ?? "") !== password) {
    secrets.setSecret(PASSWORD_SECRET, password);
  }
}

/** Whether a data file still holds a password, as versions before 0.1.4 wrote. */
export function storesPassword(value: unknown): boolean {
  const stored = z
    .object({ settings: z.object({ password: z.string().min(1) }) })
    .safeParse(value);
  return stored.success;
}

/** What goes into the data file: the app password is left out. */
export function storedPluginData(data: PluginData): StoredPluginData {
  const { password: _kept, ...settings } = data.settings;
  return { settings, states: data.states };
}

/**
 * The plugin's data: the data file, with the app password from the secret
 * store. A password an older version left in the data file is moved there.
 */
export function loadPluginData(
  value: unknown,
  secrets: SecretStore,
): PluginData {
  const data = parsePluginData(value);
  const kept = secrets.getSecret(PASSWORD_SECRET) ?? "";
  const password = kept !== "" ? kept : data.settings.password;
  keepPassword(secrets, password);
  return { ...data, settings: { ...data.settings, password } };
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
