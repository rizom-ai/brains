import { expect, test, mock } from "bun:test";
import assert from "node:assert/strict";
import { ArtifactDeliveryResolver } from "../src/artifact-delivery";
import {
  createMockShell,
  createInterfacePluginContext,
} from "@brains/plugins/test";
import type { StructuredChatCard } from "@brains/plugins";

test("artifact delivery awaits the consumer even with no context or cards", async () => {
  const resolver = new ArtifactDeliveryResolver({
    getContext: (): undefined => undefined,
    getDisplayBaseUrl: (): undefined => undefined,
    logger: { debug: mock(() => undefined) },
  });
  const entered = Promise.withResolvers<void>();
  const release = Promise.withResolvers<void>();
  const result = { id: "sent" };
  let settled = false;
  const work = resolver
    .withFiles(undefined, "public", async (delivery) => {
      expect("files" in delivery).toBe(false);
      expect(delivery.deniedCardIds.size).toBe(0);
      expect(delivery.deliveredCardIds.size).toBe(0);
      entered.resolve();
      await release.promise;
      return result;
    })
    .finally(() => {
      settled = true;
    });
  try {
    await entered.promise;
    expect(settled).toBe(false);
  } finally {
    release.resolve();
  }
  expect(await work).toBe(result);
});

test("unprovisioned artifacts never buffer and consumer failures are not retried", async () => {
  const shell = createMockShell();
  const context = createInterfacePluginContext(shell, "chat");
  await shell.getEntityService().createEntity({
    entity: {
      id: "pdf",
      entityType: "document",
      visibility: "public",
      content: `asset://sha256/${"a".repeat(64)}`,
      metadata: { filename: "artifact.pdf", status: "draft" },
    },
  });
  const debug = mock(() => undefined);
  const resolver = new ArtifactDeliveryResolver({
    getContext: (): typeof context => context,
    getDisplayBaseUrl: (): undefined => undefined,
    logger: { debug },
  });
  const cards: StructuredChatCard[] = [
    {
      kind: "attachment",
      id: "card",
      title: "PDF",
      attachment: {
        mediaType: "application/pdf",
        url: "/api/chat/attachments/document?id=pdf",
      },
    },
  ];
  const readAsset = mock(async (): Promise<never> => {
    throw new Error("Buffered read forbidden");
  });
  shell.getEntityService().readAsset = readAsset;
  const primary = new Error("Consumer failed");
  let consumed = 0;
  await assert.rejects(
    resolver.withFiles(cards, "trusted", async (delivery) => {
      consumed++;
      expect("files" in delivery).toBe(false);
      expect(delivery.sendFiles).toBeUndefined();
      expect([...delivery.deliveredCardIds]).toEqual([]);
      throw primary;
    }),
    (error: unknown) => error === primary,
  );
  expect(consumed).toBe(1);
  expect(readAsset).not.toHaveBeenCalled();
  expect(debug).not.toHaveBeenCalled();
});

test("consumer failures are not swallowed as optional artifact resolution failures", async () => {
  const debug = mock(() => undefined);
  const resolver = new ArtifactDeliveryResolver({
    getContext: (): undefined => undefined,
    getDisplayBaseUrl: (): undefined => undefined,
    logger: { debug },
  });
  const primary = new Error("transport delivery failed");
  await assert.rejects(
    resolver.withFiles([], "public", async () => {
      throw primary;
    }),
    (error: unknown) => error === primary,
  );
  expect(debug).not.toHaveBeenCalled();
});
