import {
  Browsers,
  DisconnectReason,
  makeWASocket,
  type AuthenticationState,
  type BaileysEventMap,
  type SocketConfig,
} from "baileys";
import { isPlainRecord } from "@brains/utils/predicates";
import { z } from "@brains/utils/zod";
import { RestartingListenerSupervisor } from "./restarting-listener-supervisor";
import type { WhatsAppSocket } from "./whatsapp-adapter";
import {
  loadWhatsAppAuthState,
  type WhatsAppAuthState,
  type WhatsAppSessionStore,
} from "./whatsapp-session";
import type {
  WhatsAppConnection,
  WhatsAppConnectionStatus,
  WhatsAppLogger,
} from "./whatsapp-runtime";

/** Baileys does not export its logger interface; its socket config names it. */
type ILogger = SocketConfig["logger"];

type WhatsAppSocketEvent =
  "connection.update" | "creds.update" | "messages.upsert";

/** The Baileys socket calls the connection loop makes. */
export interface WhatsAppConnectionSocket extends WhatsAppSocket {
  ev: {
    on<E extends WhatsAppSocketEvent>(
      event: E,
      listener: (arg: BaileysEventMap[E]) => void,
    ): unknown;
  };
  requestPairingCode(phoneNumber: string): Promise<string>;
  end(error: Error | undefined): void;
}

export interface WhatsAppSocketConfig {
  auth: AuthenticationState;
  logger: ILogger;
}

export type CreateWhatsAppSocket = (
  config: WhatsAppSocketConfig,
) => WhatsAppConnectionSocket;

const createBaileysSocket: CreateWhatsAppSocket = (config) =>
  makeWASocket({
    auth: config.auth,
    // WhatsApp closes the connection with 428 before login when a client
    // presents a Desktop sub-platform (WhiskeySockets/Baileys#2677).
    browser: Browsers.ubuntu("Chrome"),
    logger: config.logger,
    // The brain never shows the account as online, so its phone keeps
    // notifying.
    markOnlineOnConnect: false,
  });

/** The adapter calls the connection loop makes. */
export interface WhatsAppConnectionAdapter {
  attach(socket: WhatsAppSocket): void;
  detach(): void;
  handleUpsert(upsert: BaileysEventMap["messages.upsert"]): Promise<void>;
}

export interface WhatsAppConnectionLoopDeps {
  /** The brain's number; pairing codes are requested for it. */
  phoneNumber: string;
  session: WhatsAppSessionStore;
  adapter: WhatsAppConnectionAdapter;
  restartDelayMs: number;
  logger: WhatsAppLogger;
  createSocket?: CreateWhatsAppSocket;
}

const disconnectSchema = z.object({
  output: z.object({ statusCode: z.number() }),
});

function statusCodeOf(error: unknown): number | undefined {
  const parsed = disconnectSchema.safeParse(error);
  return parsed.success ? parsed.data.output.statusCode : undefined;
}

/**
 * Baileys logs protocol detail at every level. The loop reports the events
 * that matter itself, so Baileys' own lines stay at debug and only its
 * errors surface, as warnings.
 */
function toBaileysLogger(logger: WhatsAppLogger): ILogger {
  const forward =
    (log: WhatsAppLogger["debug"]) =>
    (obj: unknown, msg?: string): void => {
      if (typeof obj === "string") return log(obj);
      log(msg ?? "Baileys", isPlainRecord(obj) ? obj : { detail: obj });
    };
  const baileysLogger: ILogger = {
    level: "info",
    child: (): ILogger => baileysLogger,
    trace: (): void => {},
    debug: forward(logger.debug),
    info: forward(logger.debug),
    warn: forward(logger.debug),
    error: forward(logger.warn),
  };
  return baileysLogger;
}

/**
 * Keeps the brain linked to WhatsApp: opens a Baileys socket with the stored
 * session, asks for a pairing code while the session is unregistered, hands
 * the open socket to the adapter, and reconnects when the connection drops.
 * When WhatsApp logs the brain out it forgets the session and stays idle
 * until it is started again, which then pairs anew.
 */
export class WhatsAppConnectionLoop implements WhatsAppConnection {
  private readonly deps: WhatsAppConnectionLoopDeps;
  private readonly createSocket: CreateWhatsAppSocket;
  private readonly supervisor: RestartingListenerSupervisor;
  private state: WhatsAppConnectionStatus = "stopped";

  constructor(deps: WhatsAppConnectionLoopDeps) {
    this.deps = deps;
    this.createSocket = deps.createSocket ?? createBaileysSocket;
    this.supervisor = new RestartingListenerSupervisor({
      restartDelayMs: deps.restartDelayMs,
      failureMessage: "WhatsApp connection failed",
      logger: deps.logger,
      runListener: (_options, signal): Promise<void> | undefined =>
        this.state === "logged-out" ? undefined : this.connectOnce(signal),
    });
  }

  start(): void {
    this.state = "connecting";
    this.supervisor.start();
  }

  async stop(): Promise<void> {
    await this.supervisor.stop();
    this.state = "stopped";
  }

  isRunning(): boolean {
    return this.supervisor.isRunning();
  }

  status(): WhatsAppConnectionStatus {
    return this.state;
  }

  private async connectOnce(signal: AbortSignal): Promise<void> {
    // Read through a call: the signal can abort while this awaits, which
    // narrowing on `signal.aborted` cannot see.
    const stopped = (): boolean => signal.aborted;
    const auth = await loadWhatsAppAuthState(this.deps.session);
    if (stopped()) return;
    const socket = this.createSocket({
      auth: auth.state,
      logger: toBaileysLogger(this.deps.logger),
    });
    this.state = "connecting";
    const closed = this.watch(socket, auth);
    const end = (): void => socket.end(undefined);
    signal.addEventListener("abort", end, { once: true });
    const statusCode = await closed;
    signal.removeEventListener("abort", end);
    this.deps.adapter.detach();
    if (stopped()) return;

    if (statusCode === DisconnectReason.loggedOut) {
      await auth.clear();
      this.state = "logged-out";
      this.deps.logger.error(
        "WhatsApp logged out the brain's linked device; restart the brain to pair again",
      );
      return;
    }
    this.state = "connecting";
    const log =
      statusCode === DisconnectReason.restartRequired
        ? this.deps.logger.debug
        : this.deps.logger.warn;
    log("WhatsApp connection closed; reconnecting", { statusCode });
  }

  /** Resolves with the close status once WhatsApp closes the socket. */
  private watch(
    socket: WhatsAppConnectionSocket,
    auth: WhatsAppAuthState,
  ): Promise<number | undefined> {
    const pairing = { requested: false };
    return new Promise((resolve) => {
      socket.ev.on("creds.update", () => {
        auth.saveCreds().catch((error: unknown) =>
          this.deps.logger.error("Failed to save the WhatsApp session", {
            error,
          }),
        );
      });
      socket.ev.on("messages.upsert", (upsert) => {
        this.deps.adapter.handleUpsert(upsert).catch((error: unknown) =>
          this.deps.logger.error("Failed to handle a WhatsApp message", {
            error,
          }),
        );
      });
      socket.ev.on("connection.update", (update) => {
        if (update.qr && !auth.state.creds.registered && !pairing.requested) {
          pairing.requested = true;
          this.state = "awaiting-pairing";
          void this.requestPairingCode(socket);
        }
        if (update.connection === "open") {
          this.state = "connected";
          this.deps.adapter.attach(socket);
          this.deps.logger.info("WhatsApp connected", {
            id: socket.user?.id,
          });
        }
        if (update.connection === "close") {
          resolve(statusCodeOf(update.lastDisconnect?.error));
        }
      });
    });
  }

  private async requestPairingCode(
    socket: WhatsAppConnectionSocket,
  ): Promise<void> {
    try {
      const code = await socket.requestPairingCode(this.deps.phoneNumber);
      this.deps.logger.info(
        `WhatsApp pairing code: ${code}. On the brain's phone: WhatsApp → Settings → Linked devices → Link a device → Link with phone number instead.`,
      );
    } catch (error: unknown) {
      this.deps.logger.error("Failed to request a WhatsApp pairing code", {
        error,
      });
    }
  }
}
