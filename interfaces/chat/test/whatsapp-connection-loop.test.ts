import { afterEach, describe, expect, it, mock } from "bun:test";
import { EventEmitter } from "node:events";
import { createMockShell } from "@brains/plugins/test";
import type { AuthenticationState, BaileysEventMap, WAMessage } from "baileys";
import {
  WhatsAppConnectionLoop,
  type WhatsAppConnectionSocket,
  type WhatsAppSocketConfig,
} from "../src/whatsapp-connection-loop";
import {
  createWhatsAppSessionStore,
  loadWhatsAppAuthState,
  type WhatsAppSessionStore,
} from "../src/whatsapp-session";

const PHONE = "31600000001";

class FakeSocket implements WhatsAppConnectionSocket {
  readonly auth: AuthenticationState;
  readonly ev = new EventEmitter();
  user: WhatsAppConnectionSocket["user"] = undefined;
  readonly requestPairingCode = mock(
    async (_phoneNumber: string): Promise<string> => "ABCD1234",
  );
  readonly end = mock((_error: Error | undefined): void => {
    this.close(428);
  });
  readonly sendMessage = mock(async (jid: string): Promise<WAMessage> => ({
    key: { remoteJid: jid, fromMe: true, id: "sent" },
  }));
  readonly sendPresenceUpdate = mock(async (): Promise<void> => {});

  constructor(config: WhatsAppSocketConfig) {
    this.auth = config.auth;
  }

  update(update: BaileysEventMap["connection.update"]): void {
    this.ev.emit("connection.update", update);
  }

  close(statusCode: number): void {
    this.update({
      connection: "close",
      lastDisconnect: {
        error: Object.assign(new Error("closed"), { output: { statusCode } }),
        date: new Date(),
      },
    });
  }
}

function createLogger(): {
  debug: ReturnType<typeof mock>;
  info: ReturnType<typeof mock>;
  warn: ReturnType<typeof mock>;
  error: ReturnType<typeof mock>;
} {
  return { debug: mock(), info: mock(), warn: mock(), error: mock() };
}

async function waitUntil(
  condition: () => boolean | Promise<boolean>,
  deadline = Date.now() + 2_000,
): Promise<void> {
  if (await condition()) return;
  if (Date.now() > deadline) throw new Error("Condition not met in time");
  await Bun.sleep(2);
  return waitUntil(condition, deadline);
}

interface LoopFixture {
  loop: WhatsAppConnectionLoop;
  sockets: FakeSocket[];
  session: WhatsAppSessionStore;
  adapter: {
    attach: ReturnType<typeof mock>;
    detach: ReturnType<typeof mock>;
    handleUpsert: ReturnType<typeof mock>;
  };
  logger: ReturnType<typeof createLogger>;
}

const running: WhatsAppConnectionLoop[] = [];

function createLoop(
  session: WhatsAppSessionStore = createWhatsAppSessionStore(
    createMockShell().getRuntimeState(),
  ),
): LoopFixture {
  const sockets: FakeSocket[] = [];
  const adapter = {
    attach: mock(),
    detach: mock(),
    handleUpsert: mock(async (): Promise<void> => {}),
  };
  const logger = createLogger();
  const loop = new WhatsAppConnectionLoop({
    phoneNumber: PHONE,
    session,
    adapter,
    restartDelayMs: 1,
    logger,
    createSocket: (config): FakeSocket => {
      const socket = new FakeSocket(config);
      sockets.push(socket);
      return socket;
    },
  });
  running.push(loop);
  return { loop, sockets, session, adapter, logger };
}

async function started(fixture: LoopFixture): Promise<FakeSocket> {
  fixture.loop.start();
  await waitUntil(() => fixture.sockets.length === 1);
  const socket = fixture.sockets[0];
  if (!socket) throw new Error("No socket was created");
  return socket;
}

afterEach(async () => {
  await Promise.all(running.splice(0).map((loop) => loop.stop()));
});

describe("WhatsAppConnectionLoop pairing", () => {
  it("asks for a pairing code once and logs it while unregistered", async () => {
    const fixture = createLoop();
    const socket = await started(fixture);

    socket.update({ qr: "qr-1" });
    socket.update({ qr: "qr-2" });
    await waitUntil(() => fixture.logger.info.mock.calls.length > 0);

    expect(socket.requestPairingCode).toHaveBeenCalledTimes(1);
    expect(socket.requestPairingCode).toHaveBeenCalledWith(PHONE);
    expect(String(fixture.logger.info.mock.calls[0]?.[0])).toContain(
      "ABCD1234",
    );
    expect(fixture.loop.status()).toBe("awaiting-pairing");
  });

  it("does not ask for a code when the stored session is registered", async () => {
    const session = createWhatsAppSessionStore(
      createMockShell().getRuntimeState(),
    );
    const auth = await loadWhatsAppAuthState(session);
    auth.state.creds.registered = true;
    await auth.saveCreds();
    const fixture = createLoop(session);
    const socket = await started(fixture);

    socket.update({ qr: "qr-1" });

    expect(socket.requestPairingCode).not.toHaveBeenCalled();
  });
});

describe("WhatsAppConnectionLoop connection", () => {
  it("hands the open socket to the adapter and reports connected", async () => {
    const fixture = createLoop();
    const socket = await started(fixture);

    socket.update({ connection: "open" });

    expect(fixture.adapter.attach).toHaveBeenCalledWith(socket);
    expect(fixture.loop.status()).toBe("connected");
  });

  it("saves the credentials whenever Baileys updates them", async () => {
    const fixture = createLoop();
    const socket = await started(fixture);

    socket.auth.creds.registered = true;
    socket.ev.emit("creds.update", { registered: true });
    await waitUntil(
      async () =>
        (await loadWhatsAppAuthState(fixture.session)).state.creds.registered,
    );

    expect(fixture.logger.error).not.toHaveBeenCalled();
  });

  it("hands incoming messages to the adapter", async () => {
    const fixture = createLoop();
    const socket = await started(fixture);
    const upsert: BaileysEventMap["messages.upsert"] = {
      type: "notify",
      messages: [{ key: { remoteJid: "31612345678@s.whatsapp.net", id: "1" } }],
    };

    socket.ev.emit("messages.upsert", upsert);

    expect(fixture.adapter.handleUpsert).toHaveBeenCalledWith(upsert);
  });

  it("reconnects with a new socket when WhatsApp asks for a restart", async () => {
    const fixture = createLoop();
    const socket = await started(fixture);
    socket.update({ connection: "open" });

    socket.close(515);
    await waitUntil(() => fixture.sockets.length === 2);

    expect(fixture.adapter.detach).toHaveBeenCalled();
    expect(fixture.loop.status()).toBe("connecting");
  });

  it("reconnects when the connection drops", async () => {
    const fixture = createLoop();
    const socket = await started(fixture);

    socket.close(408);
    await waitUntil(() => fixture.sockets.length === 2);

    expect(fixture.loop.isRunning()).toBe(true);
  });
});

describe("WhatsAppConnectionLoop logout and stop", () => {
  it("clears the session and stops reconnecting once logged out", async () => {
    const session = createWhatsAppSessionStore(
      createMockShell().getRuntimeState(),
    );
    const auth = await loadWhatsAppAuthState(session);
    auth.state.creds.registered = true;
    await auth.saveCreds();
    const fixture = createLoop(session);
    const socket = await started(fixture);

    socket.close(401);
    await waitUntil(() => fixture.loop.status() === "logged-out");
    await Bun.sleep(20);
    const reloaded = await loadWhatsAppAuthState(session);

    expect(fixture.sockets).toHaveLength(1);
    expect(reloaded.state.creds.registered).toBe(false);
    expect(String(fixture.logger.error.mock.calls[0]?.[0])).toContain(
      "logged out",
    );
  });

  it("closes the socket when stopped", async () => {
    const fixture = createLoop();
    const socket = await started(fixture);

    await fixture.loop.stop();

    expect(socket.end).toHaveBeenCalled();
    expect(fixture.loop.isRunning()).toBe(false);
    expect(fixture.loop.status()).toBe("stopped");
  });
});
