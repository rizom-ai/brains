import { describe, expect, it } from "bun:test";
import { createPluginHarness } from "@brains/plugins/test";

import {
  EmailInterface,
  type EmailImapConfig,
  type InboundEmailClient,
  type InboundEmailSourceMessage,
} from "../src";
import {
  inboundEmailBackoffMs,
  type InboundEmailSleep,
} from "../src/inbound-supervisor";

const config: EmailImapConfig = {
  host: "imap.example.com",
  port: 993,
  user: "inbox-user",
  password: "inbox-password",
  mailbox: "INBOX",
  pollMode: "idle",
  pollIntervalMs: 25_000,
};

function livenessClient(options: {
  name: string;
  events: string[];
  idleFailure?: boolean | undefined;
}): InboundEmailClient {
  return {
    connect: async (): Promise<void> => {
      options.events.push(`${options.name}:connect`);
    },
    selectMailbox: async (): Promise<void> => {
      options.events.push(`${options.name}:select`);
    },
    fetchMessages: async function* (): AsyncGenerator<
      InboundEmailSourceMessage,
      void,
      unknown
    > {
      options.events.push(`${options.name}:fetch`);
      const messages: InboundEmailSourceMessage[] = [];
      for (const message of messages) yield message;
    },
    waitForChanges: async (signal: AbortSignal): Promise<void> => {
      options.events.push(`${options.name}:idle`);
      if (options.idleFailure) {
        throw new Error("IDLE unavailable");
      }
      await new Promise<void>((resolve) => {
        if (signal.aborted) {
          resolve();
          return;
        }
        signal.addEventListener("abort", () => resolve(), { once: true });
      });
    },
    disconnect: async (): Promise<void> => {
      options.events.push(`${options.name}:disconnect`);
    },
  };
}

async function waitUntil(predicate: () => boolean): Promise<void> {
  for (let attempt = 0; attempt < 100; attempt++) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 1));
  }
  throw new Error("Timed out waiting for inbound liveness transition");
}

describe("inbound email liveness", () => {
  it("degrades from failed IDLE to interval polling with reconnect backoff", async () => {
    const events: string[] = [];
    const sleeps: number[] = [];
    let clientCount = 0;
    const sleep: InboundEmailSleep = async (milliseconds, signal) => {
      sleeps.push(milliseconds);
      if (sleeps.length <= 2) return;
      await new Promise<void>((resolve) => {
        if (signal.aborted) {
          resolve();
          return;
        }
        signal.addEventListener("abort", () => resolve(), { once: true });
      });
    };
    const harness = createPluginHarness<EmailInterface>();
    await harness.installPlugin(
      new EmailInterface(
        { imap: config },
        {
          imapClientFactory: (): InboundEmailClient => {
            clientCount += 1;
            return livenessClient({
              name: `client-${clientCount}`,
              events,
              idleFailure: clientCount === 1,
            });
          },
          inboundSleep: sleep,
        },
      ),
    );
    const registry = harness.getMockShell().getDaemonRegistry();

    await registry.startPlugin("email");
    await waitUntil(() => clientCount === 2 && sleeps.length === 3);
    await registry.stopPlugin("email");

    expect(sleeps).toEqual([
      1_000,
      config.pollIntervalMs,
      config.pollIntervalMs,
    ]);
    expect(events).toEqual([
      "client-1:connect",
      "client-1:select",
      "client-1:fetch",
      "client-1:idle",
      "client-1:disconnect",
      "client-2:connect",
      "client-2:select",
      "client-2:fetch",
      "client-2:fetch",
      "client-2:disconnect",
    ]);
  });

  it("caps reconnect backoff", () => {
    expect(inboundEmailBackoffMs(0)).toBe(1_000);
    expect(inboundEmailBackoffMs(1)).toBe(2_000);
    expect(inboundEmailBackoffMs(5)).toBe(32_000);
    expect(inboundEmailBackoffMs(6)).toBe(60_000);
    expect(inboundEmailBackoffMs(100)).toBe(60_000);
  });
});
