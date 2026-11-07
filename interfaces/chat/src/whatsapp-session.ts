import {
  BufferJSON,
  initAuthCreds,
  proto,
  type AuthenticationCreds,
  type AuthenticationState,
  type SignalDataSet,
  type SignalDataTypeMap,
} from "baileys";
import type {
  IRuntimeStateNamespace,
  IRuntimeStateStore,
} from "@brains/plugins";
import { isPlainRecord } from "@brains/utils/predicates";
import { z } from "@brains/utils/zod";

export const whatsappSessionNamespace = "chat.whatsapp.session";

/** Baileys' session, one JSON text per credential set or signal key. */
export type WhatsAppSessionStore = Pick<
  IRuntimeStateStore<string>,
  "get" | "set" | "delete" | "clear"
>;

export function createWhatsAppSessionStore(
  runtimeState: IRuntimeStateNamespace,
): WhatsAppSessionStore {
  return runtimeState.scoped({
    namespace: whatsappSessionNamespace,
    schema: z.string(),
  });
}

export interface WhatsAppAuthState {
  state: AuthenticationState;
  /** Persist `state.creds`; Baileys has merged its update into them. */
  saveCreds(): Promise<void>;
  /** Forget the session, so the next connection pairs again. */
  clear(): Promise<void>;
}

const CREDS_KEY = "creds";

const keyOf = (type: string, id: string): string => `${type}:${id}`;

const encode = (value: unknown): string =>
  JSON.stringify(value, BufferJSON.replacer);

/**
 * Baileys' credentials and signal keys round-trip through its own BufferJSON
 * codec. Their shapes belong to Baileys, which publishes types but no schema
 * to parse them against, so the stored text is trusted as Baileys wrote it.
 */
function revive<T>(text: string): T {
  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- see above
  return JSON.parse(text, BufferJSON.reviver) as T;
}

/** App state sync keys are protobuf messages, not plain objects. */
function reviveKey<T extends keyof SignalDataTypeMap>(
  type: T,
  text: string,
): SignalDataTypeMap[T] {
  const value = revive<unknown>(text);
  const restored =
    type === "app-state-sync-key" && isPlainRecord(value)
      ? proto.Message.AppStateSyncKeyData.fromObject(value)
      : value;
  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- as for revive: the key's shape is Baileys' own, chosen by `type`
  return restored as SignalDataTypeMap[T];
}

/**
 * Baileys' auth state over runtime state, so a restart or redeploy keeps the
 * linked device. Signal keys are read and written one key at a time, as
 * Baileys asks for them.
 */
export async function loadWhatsAppAuthState(
  store: WhatsAppSessionStore,
): Promise<WhatsAppAuthState> {
  const storedCreds = await store.get(CREDS_KEY);
  const creds = storedCreds
    ? revive<AuthenticationCreds>(storedCreds)
    : initAuthCreds();

  const state: AuthenticationState = {
    creds,
    keys: {
      get: async <T extends keyof SignalDataTypeMap>(
        type: T,
        ids: string[],
      ): Promise<{ [id: string]: SignalDataTypeMap[T] }> => {
        const stored = await Promise.all(
          ids.map(
            async (id) => [id, await store.get(keyOf(type, id))] as const,
          ),
        );
        return Object.fromEntries(
          stored.flatMap(([id, text]) =>
            text === null ? [] : [[id, reviveKey(type, text)]],
          ),
        );
      },
      set: async (data: SignalDataSet): Promise<void> => {
        await Promise.all(
          Object.entries(data).flatMap(([type, entries]) =>
            Object.entries(entries).map(async ([id, value]) => {
              if (value) await store.set(keyOf(type, id), encode(value));
              else await store.delete(keyOf(type, id));
            }),
          ),
        );
      },
    },
  };

  return {
    state,
    saveCreds: (): Promise<void> => store.set(CREDS_KEY, encode(state.creds)),
    clear: async (): Promise<void> => {
      await store.clear();
    },
  };
}
