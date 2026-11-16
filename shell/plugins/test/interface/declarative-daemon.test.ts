import { describe, expect, it } from "bun:test";
import { createDeclarativeDaemon } from "../../src/interface/declarative-daemon";
import type { InterfaceDaemonHealth } from "../../src/interface/interface-definition-contract";
import { ManualDaemonTimers, settle } from "./manual-daemon-timers";

interface Attempt {
  readonly signal: AbortSignal;
  readonly health: InterfaceDaemonHealth;
  fail(error: Error): void;
  finish(): void;
}

interface Logged {
  readonly message: string;
  readonly args: unknown[];
}

function scriptedDaemon(random: () => number = (): number => 0): {
  attempts: Attempt[];
  logged: Logged[];
  timers: ManualDaemonTimers;
  daemon: ReturnType<typeof createDeclarativeDaemon>;
} {
  const attempts: Attempt[] = [];
  const logged: Logged[] = [];
  const timers = new ManualDaemonTimers();
  const daemon = createDeclarativeDaemon(
    {
      kind: "rizom-interface-daemon",
      id: "events",
      required: false,
      run: ({ signal, health }) =>
        new Promise<void>((resolve, reject) => {
          attempts.push({ signal, health, fail: reject, finish: resolve });
          signal.addEventListener("abort", () => resolve(), { once: true });
        }),
    },
    {
      logger: {
        error: (message: string, ...args: unknown[]): void => {
          logged.push({ message, args });
        },
      },
      timers,
      random,
    },
  );
  return { attempts, logged, timers, daemon };
}

function requireAttempt(attempts: Attempt[], index: number): Attempt {
  const attempt = attempts[index];
  if (!attempt) throw new Error(`Attempt ${index} did not run`);
  return attempt;
}

async function startReady(
  daemon: ReturnType<typeof createDeclarativeDaemon>,
  attempts: Attempt[],
): Promise<void> {
  const started = daemon.start();
  await settle();
  requireAttempt(attempts, 0).health.ready();
  await started;
}

const restartDelays = (logged: Logged[]): unknown[] =>
  logged.map(({ args }) =>
    typeof args[0] === "object" && args[0] !== null && "restartInMs" in args[0]
      ? args[0].restartInMs
      : undefined,
  );

describe("declarative daemon restart", () => {
  it("logs a failure after ready once and restarts after the first backoff", async () => {
    const { attempts, logged, timers, daemon } = scriptedDaemon();
    await startReady(daemon, attempts);

    requireAttempt(attempts, 0).fail(new Error("connection reset"));
    await settle();

    expect(logged).toEqual([
      {
        message: expect.stringContaining('"events"'),
        args: [
          { daemon: "events", error: "connection reset", restartInMs: 1000 },
        ],
      },
    ]);
    expect(requireAttempt(attempts, 0).signal.aborted).toBeTrue();
    expect(await daemon.healthCheck?.()).toMatchObject({
      status: "error",
      message: "connection reset",
    });

    await timers.advance(999);
    expect(attempts).toHaveLength(1);
    await timers.advance(1);
    expect(attempts).toHaveLength(2);
    expect((await daemon.healthCheck?.())?.status).toBe("error");

    requireAttempt(attempts, 1).health.ready();
    expect((await daemon.healthCheck?.())?.status).toBe("healthy");
    expect(logged).toHaveLength(1);

    await daemon.stop();
    expect(requireAttempt(attempts, 1).signal.aborted).toBeTrue();
  });

  it("restarts a run that returns before it was stopped", async () => {
    const { attempts, logged, timers, daemon } = scriptedDaemon();
    await startReady(daemon, attempts);

    requireAttempt(attempts, 0).finish();
    await settle();
    expect(logged).toHaveLength(1);
    expect(logged[0]?.args[0]).toMatchObject({
      error: 'Daemon "events" stopped before it was aborted',
    });

    await timers.advance(1000);
    expect(attempts).toHaveLength(2);
    await daemon.stop();
  });

  it("doubles the backoff on repeated failures up to the cap", async () => {
    const { attempts, logged, timers, daemon } = scriptedDaemon();
    const expected = [
      1000, 2000, 4000, 8000, 16000, 32000, 64000, 128000, 256000, 300000,
      300000,
    ];
    await startReady(daemon, attempts);
    requireAttempt(attempts, 0).fail(new Error("refused"));
    await settle();

    for (const delay of expected.slice(0, -1)) {
      await timers.advance(delay);
      requireAttempt(attempts, attempts.length - 1).fail(new Error("refused"));
      await settle();
    }

    expect(restartDelays(logged)).toEqual(expected);
    expect(attempts).toHaveLength(expected.length);
    await daemon.stop();
  });

  it("shortens each wait by up to a fifth with jitter", async () => {
    const { attempts, logged, timers, daemon } = scriptedDaemon(() => 0.5);
    await startReady(daemon, attempts);
    requireAttempt(attempts, 0).fail(new Error("refused"));
    await settle();
    await timers.advance(900);
    requireAttempt(attempts, 1).fail(new Error("refused"));
    await settle();

    expect(restartDelays(logged)).toEqual([900, 1800]);
    await daemon.stop();
  });

  it("resets the backoff once a restarted run reports ready", async () => {
    const { attempts, logged, timers, daemon } = scriptedDaemon();
    await startReady(daemon, attempts);
    requireAttempt(attempts, 0).fail(new Error("refused"));
    await settle();
    await timers.advance(1000);
    requireAttempt(attempts, 1).fail(new Error("refused"));
    await settle();
    await timers.advance(2000);
    requireAttempt(attempts, 2).health.ready();
    requireAttempt(attempts, 2).fail(new Error("refused"));
    await settle();

    expect(restartDelays(logged)).toEqual([1000, 2000, 1000]);
    await daemon.stop();
  });

  it("restarts a restarted run that does not report ready in time", async () => {
    const { attempts, logged, timers, daemon } = scriptedDaemon();
    await startReady(daemon, attempts);
    requireAttempt(attempts, 0).fail(new Error("refused"));
    await settle();
    await timers.advance(1000);

    await timers.advance(30_000);
    expect(requireAttempt(attempts, 1).signal.aborted).toBeTrue();
    expect(restartDelays(logged)).toEqual([1000, 2000]);
    expect(logged[1]?.args[0]).toMatchObject({
      error: 'Daemon "events" did not report readiness within 30000ms',
    });
    await timers.advance(2000);
    expect(attempts).toHaveLength(3);
    await daemon.stop();
  });

  it("cancels a pending restart when stopped during the backoff", async () => {
    const { attempts, timers, daemon } = scriptedDaemon();
    await startReady(daemon, attempts);
    requireAttempt(attempts, 0).fail(new Error("refused"));
    await settle();

    await daemon.stop();
    expect(timers.pending).toBe(0);
    await timers.advance(300_000);
    expect(attempts).toHaveLength(1);
  });

  it("keeps a failure before ready a failed start, with no restart", async () => {
    const { attempts, logged, timers, daemon } = scriptedDaemon();
    const started = daemon.start();
    await settle();
    requireAttempt(attempts, 0).fail(new Error("bad token"));

    expect(
      await started.then(
        () => undefined,
        (error: unknown) => error,
      ),
    ).toMatchObject({ message: "bad token" });
    await settle();
    expect(logged).toEqual([]);
    await timers.advance(300_000);
    expect(attempts).toHaveLength(1);
    expect((await daemon.healthCheck?.())?.status).toBe("error");
  });

  it("logs a failure's message and nothing it carries", async () => {
    const { attempts, logged, daemon } = scriptedDaemon();
    await startReady(daemon, attempts);
    requireAttempt(attempts, 0).fail(
      Object.assign(
        new Error("connection reset", {
          cause: { text: "private message body" },
        }),
        { payload: "private message body" },
      ),
    );
    await settle();

    const written = Bun.inspect(logged);
    expect(written).toContain("connection reset");
    expect(written).not.toContain("private message body");
    await daemon.stop();
  });
});
