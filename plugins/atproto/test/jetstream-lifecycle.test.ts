import { describe, expect, it } from "bun:test";
import { SYSTEM_CHANNELS } from "@brains/plugins";
import { createMockShell } from "@brains/test-utils";
import { AtprotoPlugin } from "../src/plugin";
import type {
  JetstreamSocket,
  JetstreamSocketMessageEvent,
} from "../src/jetstream-consumer";

class LifecycleSocket implements JetstreamSocket {
  closed = false;

  onOpen(_listener: () => void): void {}

  onMessage(_listener: (event: JetstreamSocketMessageEvent) => void): void {}

  onClose(_listener: () => void): void {}

  onError(_listener: () => void): void {}

  close(): void {
    this.closed = true;
  }
}

async function armFullBoot(
  shell: ReturnType<typeof createMockShell>,
): Promise<void> {
  await shell.getMessageBus().send({
    type: SYSTEM_CHANNELS.pluginsRegistered,
    payload: {},
    sender: "test",
    broadcast: true,
  });
}

describe("ATProto Jetstream lifecycle", () => {
  it("does not open a socket when Jetstream is disabled", async () => {
    const sockets: LifecycleSocket[] = [];
    const plugin = new AtprotoPlugin(
      {},
      {
        createJetstreamSocket: (): LifecycleSocket => {
          const socket = new LifecycleSocket();
          sockets.push(socket);
          return socket;
        },
      },
    );
    const shell = createMockShell();
    await plugin.register(shell);
    await armFullBoot(shell);
    await plugin.ready();

    expect(sockets).toHaveLength(0);
    await plugin.shutdown?.();
  });

  it("opens one opted-in socket only on a full boot and closes it on shutdown", async () => {
    const sockets: LifecycleSocket[] = [];
    const urls: string[] = [];
    const plugin = new AtprotoPlugin(
      { jetstream: { enabled: true } },
      {
        createJetstreamSocket: (url): LifecycleSocket => {
          urls.push(url);
          const socket = new LifecycleSocket();
          sockets.push(socket);
          return socket;
        },
      },
    );
    const shell = createMockShell();
    await plugin.register(shell);

    await plugin.ready();
    expect(sockets).toHaveLength(0);

    await armFullBoot(shell);
    await plugin.ready();
    expect(sockets).toHaveLength(1);
    expect(urls[0]).toContain("wantedCollections=ai.rizom.brain.card");

    await plugin.shutdown?.();
    expect(sockets[0]?.closed).toBe(true);
  });
});
