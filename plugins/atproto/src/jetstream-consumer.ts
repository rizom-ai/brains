import type { IRuntimeStateStore, ServicePluginContext } from "@brains/plugins";
import { getErrorMessage } from "@brains/utils/error";
import { z } from "@brains/utils/zod";
import type { AtprotoJetstreamConfig } from "./config";

const JETSTREAM_COLLECTION = "ai.rizom.brain.card";
const JETSTREAM_RKEY = "self";
const STATE_KEY = "checkpoint";
const MAX_DEDUPE_ENTRIES = 4096;
const JETSTREAM_RETENTION_SECONDS = 7 * 24 * 60 * 60;

const jetstreamCommitEventSchema = z.looseObject({
  did: z.string().min(1),
  time_us: z.number().int().nonnegative(),
  kind: z.string(),
  commit: z
    .looseObject({
      rev: z.string().min(1).optional(),
      operation: z.string(),
      collection: z.string(),
      rkey: z.string(),
      cid: z.string().min(1).optional(),
    })
    .optional(),
});

const jetstreamStateSchema = z
  .object({
    cursorTimeUs: z.number().int().nonnegative().optional(),
    dedupe: z
      .array(
        z.object({
          key: z.string().min(1),
          timeUs: z.number().int().nonnegative(),
        }),
      )
      .default([]),
    didCooldowns: z
      .record(z.string(), z.number().int().nonnegative())
      .default({}),
    fetchTimestamps: z.array(z.number().int().nonnegative()).default([]),
    creationTimestamps: z.array(z.number().int().nonnegative()).default([]),
  })
  .strict();

type JetstreamState = z.infer<typeof jetstreamStateSchema>;

export interface JetstreamSocketMessageEvent {
  data: unknown;
}

export interface JetstreamSocket {
  onOpen(listener: () => void): void;
  onMessage(listener: (event: JetstreamSocketMessageEvent) => void): void;
  onClose(listener: () => void): void;
  onError(listener: () => void): void;
  close(code?: number, reason?: string): void;
}

export type CreateJetstreamSocket = (url: string) => JetstreamSocket;

export interface JetstreamDiscoveryOutcome {
  status: "discovered" | "skipped";
  created?: boolean | undefined;
  retryable?: boolean | undefined;
  error?: string | undefined;
}

export interface JetstreamConsumerCallbacks {
  discover(
    repoDid: string,
    options: { allowNewCandidate: boolean },
  ): Promise<JetstreamDiscoveryOutcome>;
  markUnavailable(repoDid: string, observedAt: string): Promise<void>;
  publishHeartbeat(): Promise<void>;
  reportGap?(input: {
    previousCursorTimeUs: number;
    clampedCursorTimeUs: number;
  }): Promise<void>;
}

export interface JetstreamConsumerOptions {
  context: ServicePluginContext;
  config: AtprotoJetstreamConfig;
  callbacks: JetstreamConsumerCallbacks;
  createSocket?: CreateJetstreamSocket | undefined;
  now?: (() => number) | undefined;
  random?: (() => number) | undefined;
}

interface ParsedCommitEvent {
  did: string;
  timeUs: number;
  operation: string;
  collection: string;
  rkey: string;
  rev?: string | undefined;
  cid?: string | undefined;
}

interface SequencedEvent {
  sequence: number;
  event: ParsedCommitEvent;
  dedupeKey: string;
}

interface QueuedCandidate {
  did: string;
  latest: ParsedCommitEvent;
  events: SequencedEvent[];
}

interface TerminalSequence {
  timeUs: number;
  dedupeKey: string;
}

function defaultState(): JetstreamState {
  return {
    dedupe: [],
    didCooldowns: {},
    fetchTimestamps: [],
    creationTimestamps: [],
  };
}

function eventDedupeKey(event: ParsedCommitEvent): string {
  return [
    event.did,
    event.operation,
    event.rev ?? "",
    event.cid ?? "",
    String(event.timeUs),
  ].join("\0");
}

async function decodeMessageData(data: unknown): Promise<string> {
  if (typeof data === "string") return data;
  if (data instanceof ArrayBuffer) return new TextDecoder().decode(data);
  if (ArrayBuffer.isView(data)) {
    return new TextDecoder().decode(
      new Uint8Array(data.buffer, data.byteOffset, data.byteLength),
    );
  }
  if (data instanceof Blob) return data.text();
  throw new Error("Unsupported Jetstream websocket message");
}

function createDefaultSocket(url: string): JetstreamSocket {
  const socket = new WebSocket(url);
  return {
    onOpen: (listener) => socket.addEventListener("open", listener),
    onMessage: (listener) =>
      socket.addEventListener("message", (event) =>
        listener({ data: event.data }),
      ),
    onClose: (listener) => socket.addEventListener("close", listener),
    onError: (listener) => socket.addEventListener("error", listener),
    close: (code, reason) => socket.close(code, reason),
  };
}

/**
 * Bounded, at-least-once Jetstream candidate consumer. Durable review state
 * remains in agent entities; this class owns only operational cursor state.
 */
export class JetstreamConsumer {
  private readonly context: ServicePluginContext;
  private readonly config: AtprotoJetstreamConfig;
  private readonly callbacks: JetstreamConsumerCallbacks;
  private readonly createSocket: CreateJetstreamSocket;
  private readonly now: () => number;
  private readonly random: () => number;
  private readonly store: IRuntimeStateStore<JetstreamState>;
  private readonly queue: QueuedCandidate[] = [];
  private readonly queuedByDid = new Map<string, QueuedCandidate>();
  private readonly terminal = new Map<number, TerminalSequence>();
  private readonly activeTasks = new Set<Promise<void>>();
  private state: JetstreamState = defaultState();
  private dedupeKeys = new Set<string>();
  private nextSequence = 1;
  private nextCheckpointSequence = 1;
  private activeCount = 0;
  private socket: JetstreamSocket | undefined;
  private reconnectTimer: ReturnType<typeof setTimeout> | undefined;
  private heartbeatTimer: ReturnType<typeof setTimeout> | undefined;
  private reconnectAttempt = 0;
  private stopping = false;
  private persistTail: Promise<void> = Promise.resolve();

  constructor(options: JetstreamConsumerOptions) {
    this.context = options.context;
    this.config = options.config;
    this.callbacks = options.callbacks;
    this.createSocket = options.createSocket ?? createDefaultSocket;
    this.now = options.now ?? Date.now;
    this.random = options.random ?? Math.random;
    this.store = options.context.runtimeState.scoped({
      namespace: "atproto.jetstream",
      schema: jetstreamStateSchema,
    });
  }

  async start(): Promise<void> {
    if (this.stopping || this.socket) return;
    this.state = (await this.store.get(STATE_KEY)) ?? defaultState();
    this.pruneState();
    const earliestRetained = Math.max(
      0,
      this.now() * 1000 - JETSTREAM_RETENTION_SECONDS * 1_000_000,
    );
    if (
      this.state.cursorTimeUs !== undefined &&
      this.state.cursorTimeUs < earliestRetained
    ) {
      const previousCursorTimeUs = this.state.cursorTimeUs;
      this.state.cursorTimeUs = earliestRetained;
      await this.store.set(STATE_KEY, this.state);
      this.context.logger.warn(
        "ATProto Jetstream cursor predates retained history; clamping",
        { previousCursorTimeUs, clampedCursorTimeUs: earliestRetained },
      );
      await this.callbacks.reportGap?.({
        previousCursorTimeUs,
        clampedCursorTimeUs: earliestRetained,
      });
    }
    this.connect();
    this.scheduleHeartbeat();
  }

  async stop(): Promise<void> {
    this.stopping = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    if (this.heartbeatTimer) clearTimeout(this.heartbeatTimer);
    this.reconnectTimer = undefined;
    this.heartbeatTimer = undefined;
    this.socket?.close(1000, "shutdown");
    this.socket = undefined;

    // Queued events stay behind the durable cursor and replay after restart.
    this.queue.length = 0;
    this.queuedByDid.clear();
    await Promise.allSettled(this.activeTasks);
    await this.persistTail;
  }

  getSubscriptionUrl(): string {
    const url = new URL(this.config.endpoint);
    url.searchParams.set("wantedCollections", JETSTREAM_COLLECTION);
    const replayStart = Math.max(
      0,
      Math.floor(
        this.now() * 1000 - this.config.replayWindowSeconds * 1_000_000,
      ),
    );
    url.searchParams.set(
      "cursor",
      String(this.state.cursorTimeUs ?? replayStart),
    );
    return url.toString();
  }

  async handleRawMessage(data: unknown): Promise<void> {
    let decoded: string;
    try {
      decoded = await decodeMessageData(data);
    } catch (error) {
      this.context.logger.warn("Ignoring unreadable Jetstream message", {
        error: getErrorMessage(error),
      });
      return;
    }

    let value: unknown;
    try {
      value = JSON.parse(decoded);
    } catch {
      this.context.logger.warn("Ignoring malformed Jetstream JSON");
      return;
    }
    const parsed = jetstreamCommitEventSchema.safeParse(value);
    if (!parsed.success) {
      this.context.logger.warn("Ignoring invalid Jetstream event");
      return;
    }

    const commit = parsed.data.commit;
    const event: ParsedCommitEvent = {
      did: parsed.data.did,
      timeUs: parsed.data.time_us,
      operation: commit?.operation ?? "",
      collection: commit?.collection ?? "",
      rkey: commit?.rkey ?? "",
      ...(commit?.rev && { rev: commit.rev }),
      ...(commit?.cid && { cid: commit.cid }),
    };
    const sequenced: SequencedEvent = {
      sequence: this.nextSequence++,
      event,
      dedupeKey: eventDedupeKey(event),
    };

    if (this.dedupeKeys.has(sequenced.dedupeKey)) {
      await this.markTerminal([sequenced]);
      return;
    }

    if (
      parsed.data.kind !== "commit" ||
      event.collection !== JETSTREAM_COLLECTION ||
      event.rkey !== JETSTREAM_RKEY ||
      !["create", "update", "delete"].includes(event.operation) ||
      !event.did.startsWith("did:plc:") ||
      this.config.denyDids.includes(event.did)
    ) {
      await this.markTerminal([sequenced]);
      return;
    }

    const queued = this.queuedByDid.get(event.did);
    if (queued) {
      queued.latest = event;
      queued.events.push(sequenced);
      this.context.logger.debug("Coalesced Jetstream candidate", {
        repoDid: event.did,
        operation: event.operation,
      });
      return;
    }

    if (this.queue.length >= this.config.queueLimit) {
      this.context.logger.warn(
        "Jetstream candidate queue is full; dropping event",
        { repoDid: event.did, queueLimit: this.config.queueLimit },
      );
      await this.markTerminal([sequenced]);
      return;
    }

    const candidate: QueuedCandidate = {
      did: event.did,
      latest: event,
      events: [sequenced],
    };
    this.queue.push(candidate);
    this.queuedByDid.set(event.did, candidate);
    this.context.logger.debug("Queued Jetstream candidate", {
      repoDid: event.did,
      queueDepth: this.queue.length,
      activeCount: this.activeCount,
    });
    this.pump();
  }

  private connect(): void {
    if (this.stopping) return;
    const url = this.getSubscriptionUrl();
    try {
      const socket = this.createSocket(url);
      this.socket = socket;
      socket.onOpen(() => {
        this.reconnectAttempt = 0;
        this.context.logger.info("ATProto Jetstream connected", { url });
      });
      socket.onMessage((event) => {
        void this.handleRawMessage(event.data);
      });
      socket.onError(() => {
        this.context.logger.warn("ATProto Jetstream websocket error");
      });
      socket.onClose(() => {
        if (this.socket === socket) this.socket = undefined;
        if (!this.stopping) this.scheduleReconnect();
      });
    } catch (error) {
      this.context.logger.warn("ATProto Jetstream connection failed", {
        error: getErrorMessage(error),
      });
      this.scheduleReconnect();
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer || this.stopping) return;
    const exponent = Math.min(this.reconnectAttempt++, 8);
    const base = Math.min(60_000, 1_000 * 2 ** exponent);
    const delay = Math.floor(base * (0.8 + this.random() * 0.4));
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = undefined;
      this.connect();
    }, delay);
  }

  private scheduleHeartbeat(): void {
    if (this.stopping) return;
    const base = this.config.heartbeatIntervalHours * 60 * 60 * 1000;
    const delay = Math.floor(base * (0.9 + this.random() * 0.2));
    this.heartbeatTimer = setTimeout(() => {
      this.heartbeatTimer = undefined;
      const task = this.callbacks
        .publishHeartbeat()
        .catch((error) => {
          this.context.logger.warn("ATProto brain-card heartbeat failed", {
            error: getErrorMessage(error),
          });
        })
        .finally(() => this.scheduleHeartbeat());
      this.trackTask(task);
    }, delay);
  }

  private pump(): void {
    while (
      !this.stopping &&
      this.activeCount < this.config.concurrency &&
      this.queue.length > 0
    ) {
      const candidate = this.queue.shift();
      if (!candidate) break;
      this.queuedByDid.delete(candidate.did);
      this.activeCount += 1;
      const task = this.processCandidate(candidate)
        .catch((error) => {
          this.context.logger.error("Jetstream candidate processing failed", {
            repoDid: candidate.did,
            error: getErrorMessage(error),
          });
        })
        .finally(() => {
          this.activeCount -= 1;
          this.pump();
        });
      this.trackTask(task);
    }
  }

  private async processCandidate(candidate: QueuedCandidate): Promise<void> {
    const event = candidate.latest;
    if (event.operation === "delete") {
      await this.callbacks.markUnavailable(
        event.did,
        new Date(Math.floor(event.timeUs / 1000)).toISOString(),
      );
      await this.markTerminal(candidate.events);
      return;
    }

    const cooldownUntil =
      (this.state.didCooldowns[event.did] ?? 0) +
      this.config.perDidCooldownSeconds * 1000;
    if (this.now() < cooldownUntil) {
      this.context.logger.debug("Jetstream candidate skipped by DID cooldown", {
        repoDid: event.did,
      });
      await this.markTerminal(candidate.events);
      return;
    }

    let outcome: JetstreamDiscoveryOutcome = {
      status: "skipped",
      retryable: true,
      error: "Discovery did not run",
    };
    for (let attempt = 0; attempt < this.config.retryAttempts; attempt += 1) {
      if (!this.reserveFetch()) {
        outcome = {
          status: "skipped",
          retryable: false,
          error: "Jetstream global fetch budget exhausted",
        };
        break;
      }
      this.state.didCooldowns[event.did] = this.now();
      const allowNewCandidate = this.canCreateCandidate();
      if (!allowNewCandidate) {
        this.context.logger.warn(
          "Jetstream new-agent creation budget exhausted",
          { repoDid: event.did },
        );
      }
      outcome = await this.callbacks.discover(event.did, {
        allowNewCandidate,
      });
      if (outcome.status === "discovered" || !outcome.retryable) break;
      if (attempt + 1 < this.config.retryAttempts) {
        await Bun.sleep(Math.min(2_000, 500 * 2 ** attempt));
      }
    }

    if (outcome.created) this.state.creationTimestamps.push(this.now());
    this.context.logger.debug("Jetstream candidate reached terminal outcome", {
      repoDid: event.did,
      status: outcome.status,
      created: outcome.created ?? false,
      retryable: outcome.retryable ?? false,
      queueDepth: this.queue.length,
      activeCount: this.activeCount,
    });
    if (outcome.status === "skipped") {
      this.context.logger.warn("Jetstream brain-card candidate skipped", {
        repoDid: event.did,
        error: outcome.error ?? "unknown error",
      });
    }
    await this.markTerminal(candidate.events);
  }

  private reserveFetch(): boolean {
    const cutoff = this.now() - 60_000;
    this.state.fetchTimestamps = this.state.fetchTimestamps.filter(
      (timestamp) => timestamp >= cutoff,
    );
    if (this.state.fetchTimestamps.length >= this.config.fetchBudgetPerMinute) {
      return false;
    }
    this.state.fetchTimestamps.push(this.now());
    return true;
  }

  private canCreateCandidate(): boolean {
    const cutoff = this.now() - 60 * 60 * 1000;
    this.state.creationTimestamps = this.state.creationTimestamps.filter(
      (timestamp) => timestamp >= cutoff,
    );
    return this.state.creationTimestamps.length < this.config.newAgentsPerHour;
  }

  private async markTerminal(events: SequencedEvent[]): Promise<void> {
    for (const item of events) {
      this.terminal.set(item.sequence, {
        timeUs: item.event.timeUs,
        dedupeKey: item.dedupeKey,
      });
    }

    let advanced = false;
    for (;;) {
      const outcome = this.terminal.get(this.nextCheckpointSequence);
      if (!outcome) break;
      this.terminal.delete(this.nextCheckpointSequence);
      this.nextCheckpointSequence += 1;
      this.state.cursorTimeUs = Math.max(
        this.state.cursorTimeUs ?? 0,
        outcome.timeUs,
      );
      this.state.dedupe.push({
        key: outcome.dedupeKey,
        timeUs: outcome.timeUs,
      });
      this.dedupeKeys.add(outcome.dedupeKey);
      advanced = true;
    }
    if (!advanced) return;

    this.pruneState();
    const snapshot = jetstreamStateSchema.parse(structuredClone(this.state));
    this.persistTail = this.persistTail.then(() =>
      this.store.set(STATE_KEY, snapshot),
    );
    await this.persistTail;
  }

  private pruneState(): void {
    const replayCutoff = Math.max(
      0,
      this.now() * 1000 - this.config.replayWindowSeconds * 1_000_000,
    );
    this.state.dedupe = this.state.dedupe
      .filter((entry) => entry.timeUs >= replayCutoff)
      .slice(-MAX_DEDUPE_ENTRIES);
    this.state.fetchTimestamps = this.state.fetchTimestamps.filter(
      (timestamp) => timestamp >= this.now() - 60_000,
    );
    this.state.creationTimestamps = this.state.creationTimestamps.filter(
      (timestamp) => timestamp >= this.now() - 60 * 60 * 1000,
    );
    const cooldownCutoff =
      this.now() - Math.max(this.config.perDidCooldownSeconds * 2000, 60_000);
    this.state.didCooldowns = Object.fromEntries(
      Object.entries(this.state.didCooldowns).filter(
        ([, timestamp]) => timestamp >= cooldownCutoff,
      ),
    );
    this.dedupeKeys = new Set(this.state.dedupe.map((entry) => entry.key));
  }

  private trackTask(task: Promise<void>): void {
    this.activeTasks.add(task);
    const remove = (): void => {
      this.activeTasks.delete(task);
    };
    void task.then(remove, remove);
  }
}
