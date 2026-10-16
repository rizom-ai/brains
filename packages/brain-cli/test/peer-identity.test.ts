import { afterEach, describe, it } from "bun:test";
import type { App } from "@brains/app";
import type { PeerChannel, PeerEvent } from "@brains/core";
import { waitUntil } from "@brains/test-utils";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createFullPresetApp } from "./helpers/full-preset-app";

/** Two ends of a line between processes: payloads cross as copies, later. */
function peerPair(): [PeerChannel, PeerChannel] {
  const listeners = [
    new Set<(event: PeerEvent) => void>(),
    new Set<(event: PeerEvent) => void>(),
  ] as const;
  const end = (own: 0 | 1): PeerChannel => ({
    send: (event): void => {
      const copy = structuredClone(event);
      queueMicrotask(() => {
        for (const listener of listeners[own === 0 ? 1 : 0]) listener(copy);
      });
    },
    onEvent: (listener) => {
      listeners[own].add(listener);
      return () => listeners[own].delete(listener);
    },
  });
  return [end(0), end(1)];
}

const character = (role: string): string => `---
name: Friedrich
role: ${role}
purpose: Answers readers from the books.
values:
  - Answer from the books
---
`;

// Content synced from git is written by the worker; chat runs in the web
// process, which must answer with the character the worker stored.
describe("identity across the runtime's processes", () => {
  const apps: App[] = [];
  const directories: string[] = [];

  afterEach(async () => {
    for (const app of apps.splice(0).reverse()) await app.stop();
    for (const directory of directories.splice(0).reverse()) {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("the web process follows a character the worker writes", async () => {
    const directory = await mkdtemp(join(tmpdir(), "brain-peer-identity-"));
    directories.push(directory);
    const [webEnd, workerEnd] = peerPair();

    const web = createFullPresetApp(directory);
    apps.push(web);
    await web.migrate();
    await web.initialize(
      { mode: "register-only" },
      { migrationsCompleted: true, processRole: "web", peerChannel: webEnd },
    );
    const worker = createFullPresetApp(directory);
    apps.push(worker);
    await worker.initialize(undefined, {
      migrationsCompleted: true,
      processRole: "worker",
      peerChannel: workerEnd,
    });

    await worker
      .getShell()
      .getEntityService()
      .createEntity({
        entity: {
          id: "brain-character",
          entityType: "brain-character",
          content: character("Friedrich Nietzsche, answering from his works"),
          metadata: {},
        },
      });

    await waitUntil(
      () =>
        web.getShell().getIdentity().role ===
        "Friedrich Nietzsche, answering from his works",
      "the web identity to follow the worker's write",
      { timeoutMs: 5_000, intervalMs: 10 },
    );
  });
});
