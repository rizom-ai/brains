import { describe, expect, it } from "bun:test";
import { createPluginHarness } from "@brains/plugins/test";
import {
  EmailSourceLocatorStore,
  emailSourceLocatorSchema,
} from "../src/source-locator-store";
import { createInboundEmailSourceRef } from "../src/inbound-email";

const selection = { mailbox: "INBOX", uidValidity: "42" };

function sourceRef(uid: number): string {
  return createInboundEmailSourceRef(selection, uid);
}

describe("EmailSourceLocatorStore", () => {
  it("records opaque locators idempotently without original content", async () => {
    let now = new Date("2026-04-15T09:00:00.000Z");
    const harness = createPluginHarness();
    const backing = harness.getMockShell().getRuntimeState().scoped({
      namespace: "email.inbound.source-locators.idempotent",
      schema: emailSourceLocatorSchema,
    });
    const store = new EmailSourceLocatorStore(backing, {
      now: (): Date => now,
    });

    await store.record(sourceRef(7), selection, 7);
    now = new Date("2026-04-16T09:00:00.000Z");
    await store.record(sourceRef(7), selection, 7);

    const restarted = new EmailSourceLocatorStore(backing, {
      now: (): Date => now,
    });
    expect(await restarted.resolve(sourceRef(7))).toEqual({
      sourceRef: sourceRef(7),
      mailbox: "INBOX",
      uidValidity: "42",
      uid: 7,
      recordedAt: "2026-04-15T09:00:00.000Z",
    });
    expect(JSON.stringify(await backing.list())).not.toContain("message body");
  });

  it("refreshes an expired locator when mailbox intake replays it", async () => {
    let now = new Date("2026-04-15T09:00:00.000Z");
    const harness = createPluginHarness();
    const backing = harness.getMockShell().getRuntimeState().scoped({
      namespace: "email.inbound.source-locators.replayed",
      schema: emailSourceLocatorSchema,
    });
    const store = new EmailSourceLocatorStore(backing, {
      now: (): Date => now,
      retentionMs: 60 * 60 * 1_000,
    });

    await store.record(sourceRef(1), selection, 1);
    now = new Date("2026-04-15T10:00:00.001Z");
    await store.record(sourceRef(1), selection, 1);

    expect(await store.resolve(sourceRef(1))).toMatchObject({
      recordedAt: "2026-04-15T10:00:00.001Z",
    });
  });

  it("expires a locator at read time without waiting for another intake", async () => {
    let now = new Date("2026-04-15T09:00:00.000Z");
    const harness = createPluginHarness();
    const backing = harness.getMockShell().getRuntimeState().scoped({
      namespace: "email.inbound.source-locators.read-retention",
      schema: emailSourceLocatorSchema,
    });
    const store = new EmailSourceLocatorStore(backing, {
      now: (): Date => now,
      retentionMs: 60 * 60 * 1_000,
    });

    await store.record(sourceRef(1), selection, 1);
    now = new Date("2026-04-15T10:00:00.001Z");

    expect(await store.resolve(sourceRef(1))).toBeUndefined();
    expect(await backing.get(sourceRef(1))).toBeNull();
  });

  it("prunes expired locators and deterministically bounds retained records", async () => {
    let now = new Date("2026-04-15T09:00:00.000Z");
    const harness = createPluginHarness();
    const backing = harness.getMockShell().getRuntimeState().scoped({
      namespace: "email.inbound.source-locators.retention",
      schema: emailSourceLocatorSchema,
    });
    const store = new EmailSourceLocatorStore(backing, {
      now: (): Date => now,
      maxLocators: 2,
      retentionMs: 2 * 24 * 60 * 60 * 1_000,
    });

    await store.record(sourceRef(1), selection, 1);
    now = new Date("2026-04-17T09:00:00.001Z");
    await store.record(sourceRef(2), selection, 2);
    now = new Date("2026-04-18T09:00:00.000Z");
    await store.record(sourceRef(3), selection, 3);
    await store.record(sourceRef(4), selection, 4);
    await store.prune();

    expect(await store.resolve(sourceRef(1))).toBeUndefined();
    expect(await store.resolve(sourceRef(2))).toBeUndefined();
    expect(await store.resolve(sourceRef(3))).toBeDefined();
    expect(await store.resolve(sourceRef(4))).toBeDefined();
  });
});
