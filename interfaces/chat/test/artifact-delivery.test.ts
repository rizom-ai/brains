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
      expect(delivery.files).toEqual([]);
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

test("resolved artifacts are consumed once and send failures are not retried or suppressed", async () => {
  const shell = createMockShell();
  const context = createInterfacePluginContext(shell, "chat");
  await shell.getEntityService().createEntity({
    entity: {
      id: "pdf",
      entityType: "document",
      visibility: "public",
      content: `data:application/pdf;base64,${Buffer.from("%PDF-1.7").toString("base64")}`,
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
  const primary = new Error("SDK send failed");
  let consumed = 0;
  await assert.rejects(
    resolver.withFiles(cards, "trusted", async (delivery) => {
      consumed++;
      expect(delivery.files).toHaveLength(1);
      expect(delivery.files[0]?.filename).toBe("artifact.pdf");
      expect([...delivery.deliveredCardIds]).toEqual(["card"]);
      throw primary;
    }),
    (error: unknown) => error === primary,
  );
  expect(consumed).toBe(1);
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
