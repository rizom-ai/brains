import { describe, expect, it } from "bun:test";
import { createMockShell, type MockShell } from "../src/test/mock-shell";
import { SYSTEM_CHANNELS } from "../src";
import { probeService } from "../src/test/probe-service-runtime";

/**
 * A first-party service converted from a class tells the shell, once
 * every plugin has registered, whether startup content is still importing,
 * as directory-sync's class answered pluginsRegistered through
 * context.messaging: the shell then waits for initialSyncCompleted before
 * the brain goes ready. In the main process only, once per package.
 */

/** What the shell gathers when it announces every plugin registered. */
async function answers(shell: MockShell): Promise<unknown[]> {
  const responses = await shell.getMessageBus().collect({
    type: SYSTEM_CHANNELS.pluginsRegistered,
    payload: {},
    sender: "shell",
  });
  return responses.flatMap((response) =>
    "data" in response && response.data !== undefined ? [response.data] : [],
  );
}

describe("a first-party service's initial sync", () => {
  it("answers the shell with whether startup content is still importing", async () => {
    const shell = createMockShell();
    const { runtime } = await probeService(shell);
    let calls = 0;
    runtime.initialSync(async () => {
      calls += 1;
      return { initialSyncPending: calls === 1 };
    });
    expect(await answers(shell)).toContainEqual({ initialSyncPending: true });
    expect(await answers(shell)).toContainEqual({ initialSyncPending: false });
  });

  it("answers nothing from a worker", async () => {
    const shell = createMockShell();
    const before = shell
      .getMessageBus()
      .getHandlerCount(SYSTEM_CHANNELS.pluginsRegistered);
    const { runtime } = await probeService(shell, { executionOnly: true });
    const registered = shell
      .getMessageBus()
      .getHandlerCount(SYSTEM_CHANNELS.pluginsRegistered);
    runtime.initialSync(async () => ({ initialSyncPending: true }));
    expect(
      shell.getMessageBus().getHandlerCount(SYSTEM_CHANNELS.pluginsRegistered),
    ).toBe(registered);
    expect(registered).toBeGreaterThanOrEqual(before);
  });

  it("is answered once per package, and released when it shuts down", async () => {
    const shell = createMockShell();
    const { runtime, plugin } = await probeService(shell);
    runtime.initialSync(async () => ({ initialSyncPending: true }));
    expect(() =>
      runtime.initialSync(async () => ({ initialSyncPending: false })),
    ).toThrow('Service "probe" answers its initial sync more than once');
    await plugin.shutdown?.();
    expect(await answers(shell)).not.toContainEqual({
      initialSyncPending: true,
    });
  });
});
