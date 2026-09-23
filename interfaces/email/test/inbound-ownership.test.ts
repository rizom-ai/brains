import { expect, test, mock } from "bun:test";
import { createMockLogger } from "@brains/test-utils";
import { InboundEmailSupervisor } from "../src/inbound-supervisor";
import type {
  EmailImapConfig,
  InboundEmailClient,
  InboundEmailSourceMessage,
} from "../src/inbound-email";

const config: EmailImapConfig = {
  host: "imap.example",
  port: 993,
  user: "fixture",
  password: "fixture",
  mailbox: "INBOX",
  pollMode: "idle",
  pollIntervalMs: 1000,
};
function client(): InboundEmailClient {
  return {
    connect: mock(async (): Promise<void> => undefined),
    selectMailbox: mock(async (): Promise<string> => "1"),
    fetchMessages:
      async function* (): AsyncGenerator<InboundEmailSourceMessage> {
        yield* [];
      },
    waitForChanges: mock(async (signal: AbortSignal): Promise<void> => {
      if (signal.aborted) return;
      await new Promise<void>((resolve) =>
        signal.addEventListener("abort", () => resolve(), { once: true }),
      );
    }),
    disconnect: mock(async (): Promise<void> => undefined),
  };
}
async function rejection(pending: Promise<unknown>): Promise<unknown> {
  return pending.then(
    (): never => {
      throw new Error("Unexpected success");
    },
    (error: unknown): unknown => error,
  );
}

test.each(["connect", "select", "intake"])(
  "shutdown owns pending initial %s and fences restart until retirement",
  async (phase) => {
    const entered = Promise.withResolvers<void>();
    const operation = Promise.withResolvers<void>();
    const disconnectEntered = Promise.withResolvers<void>();
    const retired = Promise.withResolvers<void>();
    const transport = client();
    transport.connect = mock(async (): Promise<void> => {
      if (phase === "connect") {
        entered.resolve();
        await operation.promise;
      }
    });
    transport.selectMailbox = mock(async (): Promise<string> => {
      if (phase === "select") {
        entered.resolve();
        await operation.promise;
      }
      return "1";
    });
    transport.disconnect = mock(async (): Promise<void> => {
      disconnectEntered.resolve();
      await retired.promise;
    });
    const signals: AbortSignal[] = [];
    const intake = mock(
      async (
        _client: InboundEmailClient,
        _selection: unknown,
        signal: AbortSignal,
      ): Promise<number> => {
        signals.push(signal);
        if (phase === "intake") {
          entered.resolve();
          await operation.promise;
        }
        return 0;
      },
    );
    const supervisor = new InboundEmailSupervisor({
      config,
      createClient: (): InboundEmailClient => transport,
      intake,
      logger: createMockLogger(),
    });
    const startup = supervisor.start();
    expect(supervisor.start()).toBe(startup);
    await entered.promise;
    let stopped = false;
    const shutdown = supervisor.stop();
    const observed = shutdown.then((): void => {
      stopped = true;
    });
    expect(supervisor.stop()).toBe(shutdown);
    await disconnectEntered.promise;
    expect(stopped).toBe(false);
    expect(supervisor.isRunning()).toBe(false);
    expect(await rejection(supervisor.start())).toEqual(
      new Error("Inbound email listener has not retired"),
    );
    operation.resolve();
    await Promise.resolve();
    expect(stopped).toBe(false);
    retired.resolve();
    await Promise.all([startup, observed]);
    expect(transport.disconnect).toHaveBeenCalledTimes(1);
    expect(transport.waitForChanges).not.toHaveBeenCalled();
    expect(transport.selectMailbox).toHaveBeenCalledTimes(
      phase === "connect" ? 0 : 1,
    );
    expect(intake).toHaveBeenCalledTimes(phase === "intake" ? 1 : 0);
    if (phase === "intake") expect(signals[0]?.aborted).toBe(true);
    await supervisor.start();
    expect(supervisor.isConnected()).toBe(true);
    expect(signals.at(-1)?.aborted).toBe(false);
    await supervisor.stop();
    expect(transport.disconnect).toHaveBeenCalledTimes(2);
  },
);

test("stop before startup enters creates no transport", async () => {
  const createClient = mock(client);
  const supervisor = new InboundEmailSupervisor({
    config,
    createClient,
    intake: async (): Promise<number> => 0,
    logger: createMockLogger(),
  });
  const startup = supervisor.start();
  await supervisor.stop();
  await startup;
  expect(createClient).not.toHaveBeenCalled();
  expect(supervisor.isConnected()).toBe(false);
});

test("a pending reconnect is owned before connect resolves", async () => {
  const first = client();
  first.connect = async (): Promise<never> => {
    throw new Error("First connection failed");
  };
  const next = client();
  const entered = Promise.withResolvers<void>();
  const operation = Promise.withResolvers<void>();
  next.connect = async (): Promise<void> => {
    entered.resolve();
    await operation.promise;
  };
  next.disconnect = mock(async (): Promise<void> => {
    operation.resolve();
  });
  const createClient = mock(() =>
    createClient.mock.calls.length === 1 ? first : next,
  );
  const intake = mock(async (): Promise<number> => 0);
  const supervisor = new InboundEmailSupervisor({
    config,
    createClient,
    intake,
    sleep: async (): Promise<void> => undefined,
    logger: createMockLogger(),
  });
  await supervisor.start();
  await entered.promise;
  await supervisor.stop();
  expect(createClient).toHaveBeenCalledTimes(2);
  expect(first.disconnect).toHaveBeenCalledTimes(1);
  expect(next.disconnect).toHaveBeenCalledTimes(1);
  expect(next.selectMailbox).not.toHaveBeenCalled();
  expect(intake).not.toHaveBeenCalled();
});

test("failed retirement retains both errors and fences restart without retrying disconnect", async () => {
  const connectionFailure = new Error("Connection failed");
  const retirementFailure = new Error("Retirement failed");
  const transport = client();
  transport.connect = async (): Promise<never> => {
    throw connectionFailure;
  };
  transport.disconnect = mock(async (): Promise<never> => {
    throw retirementFailure;
  });
  const supervisor = new InboundEmailSupervisor({
    config,
    createClient: (): InboundEmailClient => transport,
    intake: async (): Promise<number> => 0,
    logger: createMockLogger(),
  });
  const startup = await rejection(supervisor.start());
  expect(startup).toBeInstanceOf(AggregateError);
  if (!(startup instanceof AggregateError)) throw startup;
  expect(startup.errors).toEqual([connectionFailure, retirementFailure]);
  const stopping = supervisor.stop();
  const failure = await rejection(stopping);
  expect(failure).toBeInstanceOf(AggregateError);
  if (!(failure instanceof AggregateError)) throw failure;
  expect(failure.errors).toContain(startup);
  expect(failure.errors).toContain(retirementFailure);
  expect(supervisor.stop()).toBe(stopping);
  expect(await rejection(supervisor.start())).toEqual(
    new Error("Inbound email listener has not retired"),
  );
  expect(transport.disconnect).toHaveBeenCalledTimes(1);
});
