import { describe, expect, it, mock } from "bun:test";
import { createServicePluginContext } from "@brains/plugins";
import { createMockShell } from "@brains/test-utils";
import { atprotoConfigSchema } from "../src/config";
import {
  JetstreamConsumer,
  type JetstreamDiscoveryOutcome,
  type JetstreamSocket,
  type JetstreamSocketMessageEvent,
} from "../src/jetstream-consumer";

class FakeSocket implements JetstreamSocket {
  private readonly openListeners: Array<() => void> = [];
  private readonly messageListeners: Array<
    (event: JetstreamSocketMessageEvent) => void
  > = [];
  private readonly closeListeners: Array<() => void> = [];
  private readonly errorListeners: Array<() => void> = [];
  closed = false;

  onOpen(listener: () => void): void {
    this.openListeners.push(listener);
  }

  onMessage(listener: (event: JetstreamSocketMessageEvent) => void): void {
    this.messageListeners.push(listener);
  }

  onClose(listener: () => void): void {
    this.closeListeners.push(listener);
  }

  onError(listener: () => void): void {
    this.errorListeners.push(listener);
  }

  close(): void {
    this.closed = true;
    for (const listener of this.closeListeners) listener();
  }

  emitOpen(): void {
    for (const listener of this.openListeners) listener();
  }

  emitMessage(data: unknown): void {
    for (const listener of this.messageListeners) listener({ data });
  }
}

function commitEvent(
  input: {
    did?: string;
    timeUs?: number;
    operation?: "create" | "update" | "delete";
    collection?: string;
    rkey?: string;
    cid?: string;
  } = {},
): Record<string, unknown> {
  return {
    did: input.did ?? "did:plc:peer",
    time_us: input.timeUs ?? 1_750_000_000_000_000,
    kind: "commit",
    commit: {
      rev: "3ltestrev",
      operation: input.operation ?? "create",
      collection: input.collection ?? "ai.rizom.brain.card",
      rkey: input.rkey ?? "self",
      cid: input.cid ?? "bafy-card",
      // This must never be treated as authoritative input.
      record: { siteUrl: "http://127.0.0.1/embedded-is-untrusted" },
    },
  };
}

function discoveredOutcome(created?: boolean): JetstreamDiscoveryOutcome {
  return {
    status: "discovered",
    ...(created !== undefined && { created }),
  };
}

async function eventually(assertion: () => void): Promise<void> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 100; attempt += 1) {
    try {
      assertion();
      return;
    } catch (error) {
      lastError = error;
      await Bun.sleep(5);
    }
  }
  throw lastError;
}

function createConfig(
  overrides: Record<string, unknown> = {},
): ReturnType<typeof atprotoConfigSchema.parse>["jetstream"] {
  return atprotoConfigSchema.parse({
    jetstream: {
      enabled: true,
      retryAttempts: 1,
      ...overrides,
    },
  }).jetstream;
}

describe("JetstreamConsumer", () => {
  it("uses a matching commit only as a DID signal for authoritative discovery", async () => {
    const shell = createMockShell();
    const sockets: Array<{ url: string; socket: FakeSocket }> = [];
    const discover = mock(async () => discoveredOutcome(true));
    const consumer = new JetstreamConsumer({
      context: createServicePluginContext(shell, "atproto"),
      config: createConfig(),
      callbacks: {
        discover,
        markUnavailable: mock(async () => {}),
        publishHeartbeat: mock(async () => {}),
      },
      createSocket: (url): FakeSocket => {
        const socket = new FakeSocket();
        sockets.push({ url, socket });
        return socket;
      },
      now: (): number => 1_750_000_000_000,
      random: (): number => 0.5,
    });

    await consumer.start();
    sockets[0]?.socket.emitMessage(JSON.stringify(commitEvent()));

    await eventually(() => expect(discover).toHaveBeenCalledTimes(1));
    expect(discover).toHaveBeenCalledWith("did:plc:peer", {
      allowNewCandidate: true,
    });
    expect(sockets[0]?.url).toContain("wantedCollections=ai.rizom.brain.card");
    expect(sockets[0]?.url).toContain("cursor=");

    await consumer.stop();
  });

  it("rejects irrelevant operations before candidate discovery", async () => {
    const shell = createMockShell();
    const discover = mock(async () => discoveredOutcome());
    const consumer = new JetstreamConsumer({
      context: createServicePluginContext(shell, "atproto"),
      config: createConfig(),
      callbacks: {
        discover,
        markUnavailable: mock(async () => {}),
        publishHeartbeat: mock(async () => {}),
      },
      createSocket: (): FakeSocket => new FakeSocket(),
      now: (): number => 1_750_000_000_000,
    });
    await consumer.start();

    await consumer.handleRawMessage(
      JSON.stringify(commitEvent({ collection: "app.bsky.feed.post" })),
    );
    await consumer.handleRawMessage(
      JSON.stringify(commitEvent({ rkey: "not-self", timeUs: 2 })),
    );
    await consumer.handleRawMessage(
      JSON.stringify(
        commitEvent({ did: "did:web:peer.example.com", timeUs: 3 }),
      ),
    );

    expect(discover).not.toHaveBeenCalled();
    await consumer.stop();
  });

  it("persists the contiguous cursor and deduplicates inclusive replay", async () => {
    const shell = createMockShell();
    const discover = mock(async () => discoveredOutcome(true));
    const event = commitEvent({ timeUs: 1_750_000_000_123_456 });

    const first = new JetstreamConsumer({
      context: createServicePluginContext(shell, "atproto"),
      config: createConfig(),
      callbacks: {
        discover,
        markUnavailable: mock(async () => {}),
        publishHeartbeat: mock(async () => {}),
      },
      createSocket: (): FakeSocket => new FakeSocket(),
      now: (): number => 1_750_000_000_000,
    });
    await first.start();
    await first.handleRawMessage(JSON.stringify(event));
    await eventually(() => expect(discover).toHaveBeenCalledTimes(1));
    await first.stop();

    const urls: string[] = [];
    const second = new JetstreamConsumer({
      context: createServicePluginContext(shell, "atproto"),
      config: createConfig(),
      callbacks: {
        discover,
        markUnavailable: mock(async () => {}),
        publishHeartbeat: mock(async () => {}),
      },
      createSocket: (url): FakeSocket => {
        urls.push(url);
        return new FakeSocket();
      },
      now: (): number => 1_750_000_001_000,
    });
    await second.start();
    expect(urls[0]).toContain("cursor=1750000000123456");
    await second.handleRawMessage(JSON.stringify(event));
    await Bun.sleep(10);

    expect(discover).toHaveBeenCalledTimes(1);
    await second.stop();
  });

  it("clamps a cursor older than retained history and reports the gap", async () => {
    const shell = createMockShell();
    const initialNow = 1_750_000_000_000;
    const event = commitEvent({ timeUs: initialNow * 1000 });
    const first = new JetstreamConsumer({
      context: createServicePluginContext(shell, "atproto"),
      config: createConfig(),
      callbacks: {
        discover: mock(async () => discoveredOutcome()),
        markUnavailable: mock(async () => {}),
        publishHeartbeat: mock(async () => {}),
      },
      createSocket: (): FakeSocket => new FakeSocket(),
      now: (): number => initialNow,
    });
    await first.start();
    await first.handleRawMessage(JSON.stringify(event));
    await first.stop();

    const laterNow = initialNow + 8 * 24 * 60 * 60 * 1000;
    const reportGap = mock(async () => {});
    const urls: string[] = [];
    const second = new JetstreamConsumer({
      context: createServicePluginContext(shell, "atproto"),
      config: createConfig(),
      callbacks: {
        discover: mock(async () => discoveredOutcome()),
        markUnavailable: mock(async () => {}),
        publishHeartbeat: mock(async () => {}),
        reportGap,
      },
      createSocket: (url): FakeSocket => {
        urls.push(url);
        return new FakeSocket();
      },
      now: (): number => laterNow,
    });
    await second.start();

    const earliestRetained = laterNow * 1000 - 7 * 24 * 60 * 60 * 1_000_000;
    expect(urls[0]).toContain(`cursor=${String(earliestRetained)}`);
    expect(reportGap).toHaveBeenCalledWith({
      previousCursorTimeUs: initialNow * 1000,
      clampedCursorTimeUs: earliestRetained,
    });
    await second.stop();
  });

  it("routes card deletion into staleness without deleting or discovering", async () => {
    const shell = createMockShell();
    const discover = mock(async () => discoveredOutcome());
    const markUnavailable = mock(async () => {});
    const consumer = new JetstreamConsumer({
      context: createServicePluginContext(shell, "atproto"),
      config: createConfig(),
      callbacks: {
        discover,
        markUnavailable,
        publishHeartbeat: mock(async () => {}),
      },
      createSocket: (): FakeSocket => new FakeSocket(),
      now: (): number => 1_750_000_000_000,
    });
    await consumer.start();

    await consumer.handleRawMessage(
      JSON.stringify(
        commitEvent({ operation: "delete", timeUs: 1_750_000_000_000_000 }),
      ),
    );
    await eventually(() => expect(markUnavailable).toHaveBeenCalledTimes(1));

    expect(markUnavailable).toHaveBeenCalledWith(
      "did:plc:peer",
      "2025-06-15T15:06:40.000Z",
    );
    expect(discover).not.toHaveBeenCalled();
    await consumer.stop();
  });

  it("bounds concurrency and drops work beyond the queue limit", async () => {
    const shell = createMockShell();
    const releases: Array<() => void> = [];
    const discovered: string[] = [];
    const discover = mock(
      (did: string) =>
        new Promise<{ status: "discovered" }>((resolve) => {
          discovered.push(did);
          releases.push(() => resolve({ status: "discovered" }));
        }),
    );
    const consumer = new JetstreamConsumer({
      context: createServicePluginContext(shell, "atproto"),
      config: createConfig({
        concurrency: 2,
        queueLimit: 1,
        perDidCooldownSeconds: 0,
      }),
      callbacks: {
        discover,
        markUnavailable: mock(async () => {}),
        publishHeartbeat: mock(async () => {}),
      },
      createSocket: (): FakeSocket => new FakeSocket(),
      now: (): number => 1_750_000_000_000,
    });
    await consumer.start();

    for (let index = 1; index <= 4; index += 1) {
      await consumer.handleRawMessage(
        JSON.stringify(
          commitEvent({
            did: `did:plc:peer${index}`,
            timeUs: 1_750_000_000_000_000 + index,
            cid: `bafy-card-${index}`,
          }),
        ),
      );
    }
    expect(discovered).toEqual(["did:plc:peer1", "did:plc:peer2"]);

    releases.shift()?.();
    releases.shift()?.();
    await eventually(() => expect(discovered).toHaveLength(3));
    expect(discovered).not.toContain("did:plc:peer4");
    releases.shift()?.();
    await consumer.stop();
  });

  it("coalesces repeated queued events for one repo DID", async () => {
    const shell = createMockShell();
    let releaseFirst: (() => void) | undefined;
    const discovered: string[] = [];
    const discover = mock(
      (did: string) =>
        new Promise<{ status: "discovered" }>((resolve) => {
          discovered.push(did);
          if (did === "did:plc:first") {
            releaseFirst = (): void => resolve({ status: "discovered" });
          } else {
            resolve({ status: "discovered" });
          }
        }),
    );
    const consumer = new JetstreamConsumer({
      context: createServicePluginContext(shell, "atproto"),
      config: createConfig({
        concurrency: 1,
        queueLimit: 4,
        perDidCooldownSeconds: 0,
      }),
      callbacks: {
        discover,
        markUnavailable: mock(async () => {}),
        publishHeartbeat: mock(async () => {}),
      },
      createSocket: (): FakeSocket => new FakeSocket(),
      now: (): number => 1_750_000_000_000,
    });
    await consumer.start();

    await consumer.handleRawMessage(
      JSON.stringify(commitEvent({ did: "did:plc:first", timeUs: 1 })),
    );
    await consumer.handleRawMessage(
      JSON.stringify(commitEvent({ did: "did:plc:queued", timeUs: 2 })),
    );
    await consumer.handleRawMessage(
      JSON.stringify(
        commitEvent({
          did: "did:plc:queued",
          timeUs: 3,
          cid: "bafy-newer",
          operation: "update",
        }),
      ),
    );
    releaseFirst?.();

    await eventually(() => expect(discovered).toHaveLength(2));
    expect(discovered).toEqual(["did:plc:first", "did:plc:queued"]);
    await consumer.stop();
  });

  it("enforces global fetch and new-candidate creation budgets", async () => {
    const fetchShell = createMockShell();
    const fetchOptions: Array<{ allowNewCandidate: boolean }> = [];
    const fetchConsumer = new JetstreamConsumer({
      context: createServicePluginContext(fetchShell, "atproto"),
      config: createConfig({
        concurrency: 1,
        perDidCooldownSeconds: 0,
        fetchBudgetPerMinute: 1,
      }),
      callbacks: {
        discover: mock(async (_did, options) => {
          fetchOptions.push(options);
          return discoveredOutcome(true);
        }),
        markUnavailable: mock(async () => {}),
        publishHeartbeat: mock(async () => {}),
      },
      createSocket: (): FakeSocket => new FakeSocket(),
      now: (): number => 1_750_000_000_000,
    });
    await fetchConsumer.start();
    await fetchConsumer.handleRawMessage(
      JSON.stringify(commitEvent({ did: "did:plc:first", timeUs: 1 })),
    );
    await fetchConsumer.handleRawMessage(
      JSON.stringify(commitEvent({ did: "did:plc:second", timeUs: 2 })),
    );
    await eventually(() => expect(fetchOptions).toHaveLength(1));
    await fetchConsumer.stop();

    const creationShell = createMockShell();
    const creationOptions: Array<{ allowNewCandidate: boolean }> = [];
    const creationConsumer = new JetstreamConsumer({
      context: createServicePluginContext(creationShell, "atproto"),
      config: createConfig({
        concurrency: 1,
        perDidCooldownSeconds: 0,
        newAgentsPerHour: 1,
      }),
      callbacks: {
        discover: mock(async (_did, options) => {
          creationOptions.push(options);
          return discoveredOutcome(true);
        }),
        markUnavailable: mock(async () => {}),
        publishHeartbeat: mock(async () => {}),
      },
      createSocket: (): FakeSocket => new FakeSocket(),
      now: (): number => 1_750_000_000_000,
    });
    await creationConsumer.start();
    await creationConsumer.handleRawMessage(
      JSON.stringify(commitEvent({ did: "did:plc:first", timeUs: 1 })),
    );
    await eventually(() => expect(creationOptions).toHaveLength(1));
    await creationConsumer.handleRawMessage(
      JSON.stringify(commitEvent({ did: "did:plc:second", timeUs: 2 })),
    );
    await eventually(() => expect(creationOptions).toHaveLength(2));

    expect(creationOptions).toEqual([
      { allowNewCandidate: true },
      { allowNewCandidate: false },
    ]);
    await creationConsumer.stop();
  });

  it("retries transient discovery failures only within the configured bound", async () => {
    const shell = createMockShell();
    let attempts = 0;
    const consumer = new JetstreamConsumer({
      context: createServicePluginContext(shell, "atproto"),
      config: createConfig({ retryAttempts: 2, perDidCooldownSeconds: 0 }),
      callbacks: {
        discover: mock(async () => {
          attempts += 1;
          const outcome: JetstreamDiscoveryOutcome =
            attempts === 1
              ? {
                  status: "skipped",
                  retryable: true,
                  error: "temporary PDS failure",
                }
              : discoveredOutcome();
          return outcome;
        }),
        markUnavailable: mock(async () => {}),
        publishHeartbeat: mock(async () => {}),
      },
      createSocket: (): FakeSocket => new FakeSocket(),
      now: (): number => 1_750_000_000_000,
    });
    await consumer.start();

    await consumer.handleRawMessage(JSON.stringify(commitEvent()));
    await eventually(() => expect(attempts).toBe(2));

    await consumer.stop();
  });

  it("reconnects with backoff after a socket closes and stops on shutdown", async () => {
    const shell = createMockShell();
    const sockets: FakeSocket[] = [];
    const consumer = new JetstreamConsumer({
      context: createServicePluginContext(shell, "atproto"),
      config: createConfig(),
      callbacks: {
        discover: mock(async () => discoveredOutcome()),
        markUnavailable: mock(async () => {}),
        publishHeartbeat: mock(async () => {}),
      },
      createSocket: (): FakeSocket => {
        const socket = new FakeSocket();
        sockets.push(socket);
        return socket;
      },
      random: (): number => 0.5,
    });
    await consumer.start();
    sockets[0]?.close();

    await Bun.sleep(1_050);
    expect(sockets).toHaveLength(2);
    await consumer.stop();
    await Bun.sleep(20);
    expect(sockets).toHaveLength(2);
  });

  it("publishes a jittered low-frequency heartbeat under the same lifecycle", async () => {
    const shell = createMockShell();
    const publishHeartbeat = mock(async () => {});
    const config = {
      ...createConfig(),
      heartbeatIntervalHours: 0.000001,
    };
    const consumer = new JetstreamConsumer({
      context: createServicePluginContext(shell, "atproto"),
      config,
      callbacks: {
        discover: mock(async () => discoveredOutcome()),
        markUnavailable: mock(async () => {}),
        publishHeartbeat,
      },
      createSocket: (): FakeSocket => new FakeSocket(),
      random: (): number => 0.5,
    });
    await consumer.start();

    await eventually(() => expect(publishHeartbeat).toHaveBeenCalled());

    await consumer.stop();
  });

  it("applies the DID deny-list before discovery", async () => {
    const shell = createMockShell();
    const discover = mock(async () => discoveredOutcome());
    const consumer = new JetstreamConsumer({
      context: createServicePluginContext(shell, "atproto"),
      config: createConfig({ denyDids: ["did:plc:peer"] }),
      callbacks: {
        discover,
        markUnavailable: mock(async () => {}),
        publishHeartbeat: mock(async () => {}),
      },
      createSocket: (): FakeSocket => new FakeSocket(),
      now: (): number => 1_750_000_000_000,
    });
    await consumer.start();

    await consumer.handleRawMessage(JSON.stringify(commitEvent()));

    expect(discover).not.toHaveBeenCalled();
    await consumer.stop();
  });
});
