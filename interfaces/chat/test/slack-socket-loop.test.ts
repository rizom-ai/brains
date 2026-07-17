import { describe, expect, it, mock } from "bun:test";
import { SlackSocketLoop } from "../src/slack-socket-loop";
import type { GatewayListenerOptions, SlackChatAdapter } from "../src/types";

function createAdapter(): {
  adapter: SlackChatAdapter;
  startSocketModeListener: ReturnType<typeof mock>;
} {
  const startSocketModeListener = mock(
    (
      _options: GatewayListenerOptions,
      _durationMs?: number,
      signal?: AbortSignal,
    ): Promise<Response> =>
      new Promise((resolve) => {
        signal?.addEventListener(
          "abort",
          () => resolve(new Response("stopped")),
          { once: true },
        );
      }),
  );
  return {
    adapter: {
      name: "slack",
      startSocketModeListener,
    } as unknown as SlackChatAdapter,
    startSocketModeListener,
  };
}

describe("SlackSocketLoop", () => {
  it("starts the listener and aborts it on stop", async () => {
    const { adapter, startSocketModeListener } = createAdapter();
    const loop = new SlackSocketLoop({
      listenerRunMs: 50,
      restartDelayMs: 0,
      logger: { debug: mock(() => {}), error: mock(() => {}) },
    });
    loop.setAdapter(adapter);

    loop.start();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(loop.isRunning()).toBe(true);
    expect(startSocketModeListener).toHaveBeenCalledTimes(1);
    expect(startSocketModeListener.mock.calls[0]?.[1]).toBe(50);

    await loop.stop();

    expect(startSocketModeListener.mock.calls[0]?.[2]?.aborted).toBe(true);
    expect(loop.isRunning()).toBe(false);
  });

  it("does not start twice", async () => {
    const { adapter, startSocketModeListener } = createAdapter();
    const loop = new SlackSocketLoop({
      listenerRunMs: 50,
      restartDelayMs: 0,
      logger: { debug: mock(() => {}), error: mock(() => {}) },
    });
    loop.setAdapter(adapter);

    loop.start();
    loop.start();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(startSocketModeListener).toHaveBeenCalledTimes(1);
    await loop.stop();
  });
});
