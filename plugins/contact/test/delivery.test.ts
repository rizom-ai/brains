import { describe, expect, it, mock, spyOn, type Mock } from "bun:test";
import type {
  ServiceEntityService,
  IRuntimeStateNamespace,
} from "@brains/plugins";
import { ContactDelivery } from "../src/delivery";
import {
  contactRequestAdapter,
  contactRequestSchema,
  type ContactRequest,
} from "../src";
import { ContactStorageSlots } from "../src/storage-slots";
import {
  input,
  intakeFixture,
  peer,
  type IntakeFixture,
} from "./intake-fixture";

const storage = { retentionSeconds: 86400, maxRecords: 10, maxBytes: 100000 };
const policy = { maxAttempts: 3, retryWindowSeconds: 3600 };
const signal = new AbortController().signal;
async function failure(promise: Promise<unknown>): Promise<void> {
  expect(await promise.catch((error: unknown) => error)).toEqual(
    new Error("Contact notification unavailable"),
  );
}
async function fixture(): Promise<
  IntakeFixture & {
    id: string;
    entities: ServiceEntityService;
    state: IRuntimeStateNamespace;
    send: Mock<(key: string) => Promise<boolean>>;
    makeDelivery: () => ContactDelivery;
    read: () => Promise<ContactRequest | null>;
  }
> {
  const f = await intakeFixture();
  const saved = await f.intake.submit(await f.token(), input, peer, signal);
  if (saved.kind !== "saved") throw new Error("Not saved");
  const entities = f.harness.getEntityService();
  const state = f.harness.getMockShell().getRuntimeState();
  const send = mock(async (_key: string): Promise<boolean> => true);
  const makeDelivery = (): ContactDelivery =>
    new ContactDelivery({ entities, state, storage, policy, send, now: f.now });
  const read = async (): Promise<ContactRequest | null> =>
    entities.getEntity(
      {
        entityType: "contact-request",
        id: saved.id,
        visibilityScope: "restricted",
      },
      contactRequestSchema,
    );
  return { ...f, id: saved.id, entities, state, send, makeDelivery, read };
}

describe("contact notification delivery", () => {
  it("sends only an opaque stable key, records delivery and never resends after restart", async () => {
    const f = await fixture();
    expect(await f.makeDelivery().deliver(f.id, signal)).toBe("sent");
    expect(await f.makeDelivery().deliver(f.id, signal)).toBe("sent");
    expect(f.send.mock.calls).toEqual([[`contact-notification:${f.id}`]]);
    const entity = await f.read();
    expect(entity?.metadata.notification).toBe("sent");
    expect(
      contactRequestAdapter.parseContent(entity?.content ?? "").frontmatter
        .notification,
    ).toBe("sent");
    expect(JSON.stringify(f.send.mock.calls)).not.toContain(input.email);
  });

  it("does not send concurrently and recovers known delivery after a metadata-write failure", async () => {
    const f = await fixture();
    let finish: ((value: boolean) => void) | undefined;
    let started: (() => void) | undefined;
    const sending = new Promise<void>((resolve) => {
      started = resolve;
    });
    f.send.mockImplementation(
      () =>
        new Promise<boolean>((resolve) => {
          finish = resolve;
          started?.();
        }),
    );
    const first = f.makeDelivery().deliver(f.id, signal);
    await sending;
    await failure(f.makeDelivery().deliver(f.id, signal));
    const update = spyOn(f.entities, "updateEntity").mockRejectedValue(
      new Error("PRIVATE"),
    );
    finish?.(true);
    await failure(first);
    update.mockRestore();
    expect(await f.makeDelivery().deliver(f.id, signal)).toBe("sent");
    expect(f.send).toHaveBeenCalledTimes(1);
  });

  it("bounds failed/ambiguous delivery attempts across new worker instances", async () => {
    const f = await fixture();
    f.send.mockRejectedValue(new Error(`PRIVATE ${input.email}`));
    for (let i = 0; i < 2; i++)
      await failure(f.makeDelivery().deliver(f.id, signal));
    expect(await f.makeDelivery().deliver(f.id, signal)).toBe("failed");
    expect(await f.makeDelivery().deliver(f.id, signal)).toBe("failed");
    expect(f.send).toHaveBeenCalledTimes(3);
    expect(new Set(f.send.mock.calls.map(([key]) => key)).size).toBe(1);
    expect((await f.read())?.metadata.notification).toBe("failed");
  });

  it("repairs a failed projection after a late known acknowledgement without sending again", async () => {
    const f = await fixture();
    f.send.mockResolvedValue(false);
    await failure(f.makeDelivery().deliver(f.id, signal));
    await failure(f.makeDelivery().deliver(f.id, signal));
    expect(await f.makeDelivery().deliver(f.id, signal)).toBe("failed");
    await new ContactStorageSlots(f.state, storage, f.now).settleDelivery(
      f.id,
      1,
      true,
      3,
    );
    f.queued.clear();
    await f.intake.maintain(signal);
    expect(f.queued.has(f.id)).toBe(true);
    expect(await f.makeDelivery().deliver(f.id, signal)).toBe("sent");
    expect((await f.read())?.metadata.notification).toBe("sent");
    expect(f.send).toHaveBeenCalledTimes(3);
  });

  it("stops retries before the provider's deduplication horizon and deletes delivery state with retention", async () => {
    const f = await fixture();
    f.send.mockResolvedValue(false);
    await failure(f.makeDelivery().deliver(f.id, signal));
    f.advance(3600_000);
    expect(await f.makeDelivery().deliver(f.id, signal)).toBe("failed");
    expect(f.send).toHaveBeenCalledTimes(1);
    f.advance(86400_000);
    await f.intake.maintain(signal);
    expect(
      await new ContactStorageSlots(f.state, storage, f.now).list(),
    ).toEqual([]);
    expect(await f.makeDelivery().deliver(f.id, signal)).toBe("skipped");
    expect(await f.read()).toBeNull();
    expect(f.send).toHaveBeenCalledTimes(1);
  });

  it("reuses the provider key after acceptance with a lost acknowledgement", async () => {
    const f = await fixture();
    const accepted = new Set<string>();
    f.send.mockImplementation(async (key) => {
      if (accepted.has(key)) return true;
      accepted.add(key);
      throw new Error("Lost acknowledgement");
    });
    await failure(f.makeDelivery().deliver(f.id, signal));
    expect(await f.makeDelivery().deliver(f.id, signal)).toBe("sent");
    expect(accepted.size).toBe(1);
    expect(f.send).toHaveBeenCalledTimes(2);
  });

  it("does not send when a read stalls past its reserved attempt deadline", async () => {
    const f = await fixture();
    const entity = await f.read();
    spyOn(f.entities, "getEntity").mockImplementation(async () => {
      f.advance(66_000);
      return entity;
    });
    await failure(f.makeDelivery().deliver(f.id, signal));
    expect(f.send).not.toHaveBeenCalled();
  });

  it("refuses cancelled work, deleted records and records expired before the first attempt", async () => {
    const f = await fixture();
    await failure(f.makeDelivery().deliver(f.id, AbortSignal.abort()));
    f.advance(86400_000);
    expect(await f.makeDelivery().deliver(f.id, signal)).toBe("skipped");
    expect(f.send).not.toHaveBeenCalled();
  });
});
