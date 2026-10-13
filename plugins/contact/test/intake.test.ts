import { describe, expect, it } from "bun:test";
import { contactRequestAdapter } from "../src";
import { intakeFixture, input, peer, start } from "./intake-fixture";

const signal = (): AbortSignal => new AbortController().signal;

describe("contact intake persistence", () => {
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
        expiresAt: new Date(start + 86400_000).toISOString(),
      },
      message: input.message,
    });
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
    const f = await intakeFixture({ maxRecords: 1 });
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

  it("enforces aggregate count and byte capacity and releases only confirmed expired storage", async () => {
    const f = await intakeFixture({ maxRecords: 1 });
    const token = await f.token();
    expect((await f.intake.submit(token, input, peer, signal())).kind).toBe(
      "saved",
    );
    expect(
      await f.intake.submit(await f.token(), input, peer, signal()),
    ).toEqual({ kind: "denied", reason: "capacity" });
    f.advance(86400_000);
    expect((await f.intake.maintain(signal())).deleted).toBe(1);
    expect(await f.intake.submit(token, input, peer, signal())).toEqual({
      kind: "denied",
      reason: "invalid-token",
    });
    expect(
      (await f.intake.submit(await f.token(), input, peer, signal())).kind,
    ).toBe("saved");
    const bytes = await intakeFixture({ maxBytes: 1024 });
    expect(
      await bytes.intake.submit(
        await bytes.token(),
        { ...input, message: "x".repeat(1500) },
        peer,
        signal(),
      ),
    ).toEqual({ kind: "denied", reason: "capacity" });
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

  it("retains capacity after failed deletion and respects cancellation", async () => {
    const f = await intakeFixture({ maxRecords: 1 });
    expect(
      (await f.intake.submit(await f.token(), input, peer, signal())).kind,
    ).toBe("saved");
    f.advance(86400_000);
    f.harness.getEntityService().deleteEntity = async (): Promise<never> => {
      throw new Error("PRIVATE delete failure");
    };
    expect(f.intake.maintain(signal())).rejects.toThrow(
      "Contact maintenance unavailable",
    );
    expect(
      await f.intake.submit(await f.token(), input, peer, signal()),
    ).toEqual({ kind: "denied", reason: "capacity" });
    const controller = new AbortController();
    controller.abort();
    expect(f.intake.maintain(controller.signal)).rejects.toThrow();
  });
});
