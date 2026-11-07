import { describe, expect, it } from "bun:test";
import { FormStorageSlots } from "@brains/forms";
import { CONTACT_SLOTS, contactRequestAdapter } from "../src";
import { intakeFixture, input, peer, start } from "./intake-fixture";

const signal = (): AbortSignal => new AbortController().signal;

describe("contact intake persistence", () => {
  it("rejects invalid submissions without consuming or changing a token", async () => {
    const f = await intakeFixture();
    const token = await f.token();
    for (const bad of [
      { ...input, website: "spam" },
      { ...input, message: "x".repeat(4001) },
      { ...input, email: "wrong" },
      { ...input, visibility: "public" },
    ]) {
      expect(await f.intake.submit(token, bad, peer, signal())).toEqual({
        kind: "denied",
        reason: "invalid-submission",
      });
    }
    expect((await f.intake.submit(token, input, peer, signal())).kind).toBe(
      "saved",
    );
  });

  it("saves one restricted request and reconciles concurrent duplicate posts", async () => {
    const f = await intakeFixture();
    const token = await f.token();
    const results = await Promise.all(
      Array.from({ length: 5 }, () =>
        f.intake.submit(token, input, peer, signal()),
      ),
    );
    expect(results.some((result) => result.kind === "saved")).toBe(true);
    expect((await f.intake.submit(token, input, peer, signal())).kind).toBe(
      "saved",
    );
    const entities = await f.harness.getEntityService().listEntities({
      entityType: "contact-request",
      options: { filter: { visibilityScope: "restricted" } },
    });
    expect(entities).toHaveLength(1);
    const entity = entities[0];
    if (!entity) throw new Error("Missing saved request");
    expect(entity.visibility).toBe("restricted");
    expect(contactRequestAdapter.parseContent(entity.content)).toMatchObject({
      frontmatter: {
        name: input.name,
        email: input.email,
        notification: "pending",
        receivedAt: new Date(start).toISOString(),
      },
      message: input.message,
    });
    expect(
      contactRequestAdapter.parseContent(entity.content).frontmatter,
    ).not.toHaveProperty("expiresAt");
    expect(f.queued).toEqual(new Set([entity.id]));
    expect(
      await f.intake.submit(
        token,
        { ...input, message: "different" },
        peer,
        signal(),
      ),
    ).toEqual({ kind: "denied", reason: "submission-conflict" });
  });

  it("acknowledges saved, not delivered, when enqueue fails and later recovers the outbox", async () => {
    const f = await intakeFixture();
    f.failEnqueue(true);
    expect(
      (await f.intake.submit(await f.token(), input, peer, signal())).kind,
    ).toBe("saved");
    expect(f.queued.size).toBe(0);
    f.failEnqueue(false);
    const report = await f.intake.maintain(signal());
    expect(report.pendingNotifications).toBe(1);
    expect(f.queued.size).toBe(1);
    await f.intake.maintain(signal());
    expect(f.queued.size).toBe(1);
  });

  it("reconciles a lost create acknowledgement without creating another entity", async () => {
    const f = await intakeFixture();
    const entities = f.harness.getEntityService();
    const create = entities.createEntity.bind(entities);
    entities.createEntity = async (request): ReturnType<typeof create> => {
      await create(request);
      throw new Error("PRIVATE lost storage acknowledgement");
    };
    const token = await f.token();
    expect((await f.intake.submit(token, input, peer, signal())).kind).toBe(
      "saved",
    );
    expect((await f.intake.submit(token, input, peer, signal())).kind).toBe(
      "saved",
    );
    expect(
      await entities.listEntities({
        entityType: "contact-request",
        options: { filter: { visibilityScope: "restricted" } },
      }),
    ).toHaveLength(1);
  });

  it("never treats a receipt alone as persistence or refunds an uncertain write slot", async () => {
    const f = await intakeFixture({ maxInFlight: 1 });
    f.harness.getEntityService().createEntity = async (): Promise<never> => {
      throw new Error("PRIVATE storage failure");
    };
    const token = await f.token();
    expect(await f.intake.submit(token, input, peer, signal())).toEqual({
      kind: "denied",
      reason: "unavailable",
    });
    expect(await f.intake.submit(token, input, peer, signal())).toEqual({
      kind: "denied",
      reason: "unavailable",
    });
    f.advance(86400_000);
    expect((await f.intake.maintain(signal())).uncertainWrites).toBe(1);
    expect(
      await f.intake.submit(await f.token(), input, peer, signal()),
    ).toEqual({ kind: "denied", reason: "capacity" });
    expect(f.queued.size).toBe(0);
  });

  it("keeps a saved request with no expiry and bounds only the work still in flight", async () => {
    const f = await intakeFixture({ maxInFlight: 1 });
    const saved = await f.intake.submit(await f.token(), input, peer, signal());
    if (saved.kind !== "saved") throw new Error("Missing saved request");
    // Its alert has not settled, so its slot is still taken.
    expect(
      await f.intake.submit(await f.token(), input, peer, signal()),
    ).toEqual({ kind: "denied", reason: "capacity" });
    f.advance(365 * 86400_000);
    f.queued.clear();
    expect(await f.intake.maintain(signal())).toMatchObject({
      released: 0,
      pendingNotifications: 1,
    });
    expect(f.queued).toEqual(new Set([saved.id]));
    expect(
      await f.harness.getEntityService().getEntity({
        entityType: "contact-request",
        id: saved.id,
        visibilityScope: "restricted",
      }),
    ).not.toBeNull();
  });

  it("does not recreate a manually deleted request while a retry receipt still exists", async () => {
    const f = await intakeFixture();
    const token = await f.token();
    const saved = await f.intake.submit(token, input, peer, signal());
    if (saved.kind !== "saved") throw new Error("Missing saved request");
    await f.harness
      .getEntityService()
      .deleteEntity({ entityType: "contact-request", id: saved.id });
    expect(await f.intake.submit(token, input, peer, signal())).toEqual({
      kind: "denied",
      reason: "unavailable",
    });
    expect(
      await f.harness.getEntityService().getEntity({
        entityType: "contact-request",
        id: saved.id,
        visibilityScope: "restricted",
      }),
    ).toBeNull();
  });

  it("releases the slot of a request its owner deleted and respects cancellation", async () => {
    const f = await intakeFixture({ maxInFlight: 1 });
    const saved = await f.intake.submit(await f.token(), input, peer, signal());
    if (saved.kind !== "saved") throw new Error("Missing saved request");
    await f.harness
      .getEntityService()
      .deleteEntity({ entityType: "contact-request", id: saved.id });
    f.queued.clear();
    expect(await f.intake.maintain(signal())).toMatchObject({
      released: 1,
      pendingNotifications: 0,
    });
    expect(f.queued.size).toBe(0);
    const slots = new FormStorageSlots(
      f.harness.getMockShell().getRuntimeState(),
      CONTACT_SLOTS,
      f.now,
    );
    expect(await slots.list()).toEqual([]);
    expect(
      (await f.intake.submit(await f.token(), input, peer, signal())).kind,
    ).toBe("saved");
    const controller = new AbortController();
    controller.abort();
    expect(f.intake.maintain(controller.signal)).rejects.toThrow();
  });
});
