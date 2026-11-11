import { describe, expect, it, mock, spyOn, type Mock } from "bun:test";
import type {
  ServiceEntityService,
  IRuntimeStateNamespace,
} from "@brains/plugins";
import {
  FormDelivery,
  FormRecords,
  FormStorageSlots,
  type FormAlertOutcome,
  type FormStorageSlot,
} from "@brains/forms";
import { CONTACT_SLOTS, contactRequestTarget } from "../src";
import {
  contactRequestAdapter,
  contactRequestSchema,
  type ContactRequest,
} from "../src";
import {
  input,
  intakeFixture,
  peer,
  type IntakeFixture,
} from "./intake-fixture";

const policy = { maxAttempts: 3, retryWindowSeconds: 3600 };
const signal = new AbortController().signal;
async function failure(promise: Promise<unknown>): Promise<void> {
  expect(await promise.catch((error: unknown) => error)).toEqual(
    new Error("Form notification unavailable"),
  );
}
async function fixture(): Promise<
  IntakeFixture & {
    id: string;
    entities: ServiceEntityService;
    state: IRuntimeStateNamespace;
    send: Mock<(key: string) => Promise<FormAlertOutcome>>;
    makeDelivery: () => FormDelivery;
    read: () => Promise<ContactRequest | null>;
    slots: () => FormStorageSlots;
    handle: () => Promise<void>;
  }
> {
  const f = await intakeFixture();
  const saved = await f.intake.submit(await f.token(), input, peer, signal);
  if (saved.kind !== "saved") throw new Error("Not saved");
  const entities = f.harness.getEntityService();
  const state = f.harness.getMockShell().getRuntimeState();
  const send = mock(async (_key: string): Promise<FormAlertOutcome> => ({
    sent: true,
  }));
  const makeDelivery = (): FormDelivery =>
    new FormDelivery({
      target: new FormRecords(entities, contactRequestTarget),
      state,
      slots: CONTACT_SLOTS,
      policy,
      send: (_id, key) => send(key),
      now: f.now,
    });
  const read = async (): Promise<ContactRequest | null> =>
    entities.getEntity(
      {
        entityType: "contact-request",
        id: saved.id,
        visibilityScope: "restricted",
      },
      contactRequestSchema,
    );
  const slots = (): FormStorageSlots =>
    new FormStorageSlots(state, CONTACT_SLOTS, f.now);
  // What marking it Done in the Inbox writes.
  const handle = async (): Promise<void> => {
    const entity = await read();
    if (!entity) throw new Error("Missing request");
    const { frontmatter, message } = contactRequestAdapter.parseContent(
      entity.content,
    );
    await entities.updateEntity({
      entity: {
        ...entity,
        content: contactRequestAdapter.createContent(
          { ...frontmatter, status: "handled" },
          message,
        ),
        metadata: { ...entity.metadata, status: "handled" },
      },
    });
  };
  return {
    ...f,
    id: saved.id,
    entities,
    state,
    send,
    makeDelivery,
    read,
    slots,
    handle,
  };
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
    // A settled alert leaves nothing in flight; the request itself stays.
    expect(await f.slots().list()).toEqual([]);
  });

  it("does not send concurrently and recovers known delivery after a metadata-write failure", async () => {
    const f = await fixture();
    let finish: ((value: FormAlertOutcome) => void) | undefined;
    let started: (() => void) | undefined;
    const sending = new Promise<void>((resolve) => {
      started = resolve;
    });
    f.send.mockImplementation(
      () =>
        new Promise<FormAlertOutcome>((resolve) => {
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
    finish?.({ sent: true });
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

  it("keeps why the last attempt failed with the failed alert, never message content", async () => {
    const f = await fixture();
    const slot = async (): Promise<FormStorageSlot | undefined> =>
      (await f.slots().list())[0]?.[1];
    f.send.mockResolvedValue({ sent: false, failure: "transport-missing" });
    await failure(f.makeDelivery().deliver(f.id, signal));
    expect((await slot())?.delivery.failure).toBe("transport-missing");
    f.send.mockRejectedValue(new Error(`PRIVATE ${input.email}`));
    await failure(f.makeDelivery().deliver(f.id, signal));
    expect((await slot())?.delivery.failure).toBe("unconfirmed");
    f.send.mockResolvedValue({
      sent: false,
      failure: "resend_validation_error",
    });
    expect(await f.makeDelivery().deliver(f.id, signal)).toBe("failed");
    expect((await slot())?.delivery.failure).toBe("resend_validation_error");
    expect(JSON.stringify(await slot())).not.toContain(input.email);
  });

  it("repairs a failed projection after a late known acknowledgement without sending again", async () => {
    const f = await fixture();
    f.send.mockResolvedValue({ sent: false, failure: "delivery-failed" });
    await failure(f.makeDelivery().deliver(f.id, signal));
    await failure(f.makeDelivery().deliver(f.id, signal));
    expect(await f.makeDelivery().deliver(f.id, signal)).toBe("failed");
    await f.slots().settleDelivery(f.id, 1, true, 3);
    f.queued.clear();
    await f.intake.maintain(signal);
    expect(f.queued.has(f.id)).toBe(true);
    expect(await f.makeDelivery().deliver(f.id, signal)).toBe("sent");
    expect((await f.read())?.metadata.notification).toBe("sent");
    expect(f.send).toHaveBeenCalledTimes(3);
  });

  it("stops retries before the provider's deduplication horizon and keeps a failed alert until its request is done", async () => {
    const f = await fixture();
    f.send.mockResolvedValue({ sent: false, failure: "delivery-failed" });
    await failure(f.makeDelivery().deliver(f.id, signal));
    f.advance(3600_000);
    expect(await f.makeDelivery().deliver(f.id, signal)).toBe("failed");
    expect(f.send).toHaveBeenCalledTimes(1);
    f.advance(90 * 86400_000);
    await f.intake.maintain(signal);
    expect((await f.read())?.metadata.notification).toBe("failed");
    expect(await f.slots().list()).toHaveLength(1);
    await f.handle();
    expect(await f.intake.maintain(signal)).toMatchObject({ released: 1 });
    expect(await f.slots().list()).toEqual([]);
    expect((await f.read())?.metadata.status).toBe("handled");
    expect(f.send).toHaveBeenCalledTimes(1);
  });

  it("reuses the provider key after acceptance with a lost acknowledgement", async () => {
    const f = await fixture();
    const accepted = new Set<string>();
    f.send.mockImplementation(async (key) => {
      if (accepted.has(key)) return { sent: true };
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

  it("refuses cancelled work and releases a deleted request's slot without sending", async () => {
    const f = await fixture();
    await failure(f.makeDelivery().deliver(f.id, AbortSignal.abort()));
    await f.entities.deleteEntity({ entityType: "contact-request", id: f.id });
    expect(await f.makeDelivery().deliver(f.id, signal)).toBe("skipped");
    expect(await f.slots().list()).toEqual([]);
    expect(f.send).not.toHaveBeenCalled();
  });

  it("frees the slot of a delivered alert for the next submission", async () => {
    const f = await intakeFixture({ maxInFlight: 1 });
    const saved = await f.intake.submit(await f.token(), input, peer, signal);
    if (saved.kind !== "saved") throw new Error("Not saved");
    expect(await f.intake.submit(await f.token(), input, peer, signal)).toEqual(
      { kind: "denied", reason: "capacity" },
    );
    const delivery = new FormDelivery({
      target: new FormRecords(
        f.harness.getEntityService(),
        contactRequestTarget,
      ),
      state: f.harness.getMockShell().getRuntimeState(),
      slots: CONTACT_SLOTS,
      policy,
      send: async (): Promise<FormAlertOutcome> => ({ sent: true }),
      now: f.now,
    });
    expect(await delivery.deliver(saved.id, signal)).toBe("sent");
    expect(
      (await f.intake.submit(await f.token(), input, peer, signal)).kind,
    ).toBe("saved");
  });
});
