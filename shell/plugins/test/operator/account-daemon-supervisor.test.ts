import { describe, expect, it } from "bun:test";
import { z } from "@brains/utils/zod";
import { AccountSettingsRegistry, defineAccountSettings } from "../../src";
import { createAccountDaemon } from "../../src/operator/account-daemon-supervisor";
import type { InterfaceDaemonHealth } from "../../src/interface/interface-definition-contract";
import { MemoryAccountSettingsBackend } from "../../src/test/memory-account-settings-backend";
import { ManualDaemonTimers, settle } from "../interface/manual-daemon-timers";

const settings = defineAccountSettings({
  title: "Mailbox",
  schema: z.object({ password: z.string().min(1) }),
  fields: { password: { label: "Password", secret: true } },
});

interface Attempt {
  readonly accountId: string;
  readonly password: string;
  readonly signal: AbortSignal;
  readonly health: InterfaceDaemonHealth;
  fail(error: Error): void;
}

interface Logged {
  readonly message: string;
  readonly args: unknown[];
}

async function scriptedAccountDaemon(): Promise<{
  attempts: Attempt[];
  logged: Logged[];
  timers: ManualDaemonTimers;
  daemon: ReturnType<typeof createAccountDaemon>;
  save(actorId: string, password: string): Promise<void>;
  remove(actorId: string): Promise<void>;
}> {
  const attempts: Attempt[] = [];
  const logged: Logged[] = [];
  const timers = new ManualDaemonTimers();
  const registry = new AccountSettingsRegistry();
  registry.bindBackend(new MemoryAccountSettingsBackend());
  const registration = registry.register({
    ownerPluginId: "mailbox",
    packageName: "@fixture/mailbox",
    definitionId: "mailbox",
    definition: settings,
  });
  const save = async (actorId: string, password: string): Promise<void> => {
    await registry.save(registration.id, actorId, { password });
    await settle();
  };
  const remove = async (actorId: string): Promise<void> => {
    await registry.delete(registration.id, actorId);
    await settle();
  };
  await save("actor-1", "hunter2");
  const daemon = createAccountDaemon(
    {
      kind: "rizom-interface-daemon",
      id: "mailboxes",
      required: false,
      forAccounts: settings,
      run: ({ account, signal, health }) =>
        new Promise<void>((resolve, reject) => {
          attempts.push({
            accountId: account.id,
            password: String(account.settings["password"]),
            signal,
            health,
            fail: reject,
          });
          signal.addEventListener("abort", () => resolve(), { once: true });
        }),
    },
    registration,
    registry,
    {
      logger: {
        error: (message: string, ...args: unknown[]): void => {
          logged.push({ message, args });
        },
      },
      timers,
      random: (): number => 0,
    },
  );
  return { attempts, logged, timers, daemon, save, remove };
}

function requireAttempt(attempts: Attempt[], index: number): Attempt {
  const attempt = attempts[index];
  if (!attempt) throw new Error(`Attempt ${index} did not run`);
  return attempt;
}

async function startReady(
  daemon: ReturnType<typeof createAccountDaemon>,
  attempts: Attempt[],
): Promise<void> {
  await daemon.start();
  await settle();
  requireAttempt(attempts, 0).health.ready();
}

const restartDelays = (logged: Logged[]): unknown[] =>
  logged.map(({ args }) =>
    typeof args[0] === "object" && args[0] !== null && "restartInMs" in args[0]
      ? args[0].restartInMs
      : undefined,
  );

describe("account daemon task restart", () => {
  it("logs a task failure after ready once and restarts it after the first backoff", async () => {
    const { attempts, logged, timers, daemon } = await scriptedAccountDaemon();
    await startReady(daemon, attempts);

    requireAttempt(attempts, 0).fail(new Error("connection reset"));
    await settle();

    expect(logged).toEqual([
      {
        message: expect.stringContaining('"mailboxes"'),
        args: [
          {
            daemon: "mailboxes",
            account: "actor-1",
            error: "connection reset",
            restartInMs: 1000,
          },
        ],
      },
    ]);
    expect(requireAttempt(attempts, 0).signal.aborted).toBeTrue();
    expect(await daemon.healthCheck?.()).toMatchObject({
      status: "error",
      details: { total: 1, error: 1 },
    });

    await timers.advance(999);
    expect(attempts).toHaveLength(1);
    await timers.advance(1);
    expect(attempts.map(({ accountId }) => accountId)).toEqual([
      "actor-1",
      "actor-1",
    ]);
    expect((await daemon.healthCheck?.())?.status).toBe("error");

    requireAttempt(attempts, 1).health.ready();
    expect(await daemon.healthCheck?.()).toMatchObject({
      status: "healthy",
      details: { total: 1, ready: 1 },
    });

    await daemon.stop();
    expect(requireAttempt(attempts, 1).signal.aborted).toBeTrue();
  });

  it("doubles a task's backoff on repeated failures up to the cap", async () => {
    const { attempts, logged, timers, daemon } = await scriptedAccountDaemon();
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

  it("resets a task's backoff once its restart reports ready", async () => {
    const { attempts, logged, timers, daemon } = await scriptedAccountDaemon();
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

  it("cancels a pending task restart when the brain stops", async () => {
    const { attempts, timers, daemon } = await scriptedAccountDaemon();
    await startReady(daemon, attempts);
    requireAttempt(attempts, 0).fail(new Error("refused"));
    await settle();

    await daemon.stop();
    expect(timers.pending).toBe(0);
    await timers.advance(300_000);
    expect(attempts).toHaveLength(1);
  });

  it("cancels a pending task restart when the account is removed", async () => {
    const { attempts, timers, daemon, remove } = await scriptedAccountDaemon();
    await startReady(daemon, attempts);
    requireAttempt(attempts, 0).fail(new Error("refused"));
    await settle();

    await remove("actor-1");
    await timers.advance(300_000);
    expect(attempts).toHaveLength(1);
    expect(await daemon.healthCheck?.()).toMatchObject({
      details: { total: 0 },
    });
    await daemon.stop();
  });

  it("replaces a pending task restart when the account's settings change", async () => {
    const { attempts, logged, timers, daemon, save } =
      await scriptedAccountDaemon();
    await startReady(daemon, attempts);
    requireAttempt(attempts, 0).fail(new Error("refused"));
    await settle();

    await save("actor-1", "rotated");
    expect(attempts.map(({ password }) => password)).toEqual([
      "hunter2",
      "rotated",
    ]);
    requireAttempt(attempts, 1).health.ready();
    await timers.advance(300_000);
    expect(attempts).toHaveLength(2);
    expect(logged).toHaveLength(1);
    await daemon.stop();
  });

  it("keeps a task that fails before ready failed, logged once with no restart", async () => {
    const { attempts, logged, timers, daemon } = await scriptedAccountDaemon();
    await daemon.start();
    await settle();
    requireAttempt(attempts, 0).fail(new Error("bad password"));
    await settle();

    expect(logged).toEqual([
      {
        message: expect.stringContaining('"mailboxes"'),
        args: [
          { daemon: "mailboxes", account: "actor-1", error: "bad password" },
        ],
      },
    ]);
    await timers.advance(300_000);
    expect(attempts).toHaveLength(1);
    expect(await daemon.healthCheck?.()).toMatchObject({
      status: "error",
      details: { total: 1, error: 1 },
    });
    await daemon.stop();
  });

  it("logs a task failure's message and no settings or content", async () => {
    const { attempts, logged, daemon } = await scriptedAccountDaemon();
    await startReady(daemon, attempts);
    requireAttempt(attempts, 0).fail(
      Object.assign(
        new Error("connection reset", {
          cause: { text: "private message body" },
        }),
        { payload: "private message body", password: "hunter2" },
      ),
    );
    await settle();

    const written = Bun.inspect(logged);
    expect(written).toContain("connection reset");
    expect(written).not.toContain("private message body");
    expect(written).not.toContain("hunter2");
    await daemon.stop();
  });
});
