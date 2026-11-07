import { describe, expect, it } from "bun:test";
import { createMockShell } from "@brains/plugins/test";
import {
  createWhatsAppSessionStore,
  loadWhatsAppAuthState,
} from "../src/whatsapp-session";

function createStore(): ReturnType<typeof createWhatsAppSessionStore> {
  return createWhatsAppSessionStore(createMockShell().getRuntimeState());
}

describe("WhatsApp session in runtime state", () => {
  it("starts an unregistered session when nothing is stored", async () => {
    const auth = await loadWhatsAppAuthState(createStore());

    expect(auth.state.creds.registered).toBe(false);
    expect(auth.state.creds.noiseKey.private).toBeInstanceOf(Uint8Array);
  });

  it("reads saved credentials back after a restart", async () => {
    const store = createStore();
    const first = await loadWhatsAppAuthState(store);
    first.state.creds.registered = true;
    first.state.creds.me = { id: "31600000001:5@s.whatsapp.net" };
    await first.saveCreds();

    const restarted = await loadWhatsAppAuthState(store);

    expect(restarted.state.creds.registered).toBe(true);
    expect(restarted.state.creds.me?.id).toBe("31600000001:5@s.whatsapp.net");
    expect(Buffer.from(restarted.state.creds.noiseKey.private)).toEqual(
      Buffer.from(first.state.creds.noiseKey.private),
    );
  });

  it("keeps signal keys, with their bytes, across a restart", async () => {
    const store = createStore();
    const first = await loadWhatsAppAuthState(store);
    const keyPair = {
      public: new Uint8Array([1, 2, 3]),
      private: new Uint8Array([4, 5, 6]),
    };
    await first.state.keys.set({ "pre-key": { "7": keyPair } });

    const restarted = await loadWhatsAppAuthState(store);
    const keys = await restarted.state.keys.get("pre-key", ["7", "8"]);

    expect(Object.keys(keys)).toEqual(["7"]);
    expect(Buffer.from(keys["7"]?.private ?? [])).toEqual(
      Buffer.from([4, 5, 6]),
    );
  });

  it("deletes a signal key that is set to null", async () => {
    const store = createStore();
    const auth = await loadWhatsAppAuthState(store);
    await auth.state.keys.set({
      session: { "31612345678.0": new Uint8Array([9]) },
    });

    await auth.state.keys.set({ session: { "31612345678.0": null } });

    expect(await auth.state.keys.get("session", ["31612345678.0"])).toEqual({});
  });

  it("forgets everything when the session is cleared", async () => {
    const store = createStore();
    const auth = await loadWhatsAppAuthState(store);
    auth.state.creds.registered = true;
    await auth.saveCreds();
    await auth.state.keys.set({
      "pre-key": {
        "1": { public: new Uint8Array([1]), private: new Uint8Array([2]) },
      },
    });

    await auth.clear();
    const fresh = await loadWhatsAppAuthState(store);

    expect(fresh.state.creds.registered).toBe(false);
    expect(await fresh.state.keys.get("pre-key", ["1"])).toEqual({});
  });
});
