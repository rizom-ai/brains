// Staged as reminders.test.ts after this package is packed and installed.
import { expect, test } from "bun:test";
import reminders, { dueCount, reminder } from "@example/reminders";
import { createBrainTestHarness } from "@rizom/brain/testing";

const past = "2000-01-01T00:00:00.000Z";

test("add uses owned typed content and preserves the body", async () => {
  const harness = createBrainTestHarness();
  try {
    const installed = await harness.installPackage(reminders);
    await harness.finalizeRegistration();
    expect(installed.tool("add").localName).toBe("add");
    expect(
      await installed
        .tool("add")
        .call({ id: "call", content: "Call Sam", dueAt: past }),
    ).toEqual({ ok: true, data: { id: "call" } });
    expect(await harness.getEntity(reminder.type, "call")).toMatchObject({
      content: "Call Sam",
      metadata: { dueAt: past },
    });
  } finally {
    await harness.reset();
  }
});

test("due list, exported subscription, route, and local template agree", async () => {
  const harness = createBrainTestHarness();
  try {
    const installed = await harness.installPackage(reminders);
    await harness.finalizeRegistration();
    harness.addEntities([
      {
        id: "due",
        entityType: reminder.type,
        content: "Call Sam",
        metadata: { dueAt: past, done: false },
      },
      {
        id: "done",
        entityType: reminder.type,
        content: "Already called",
        metadata: { dueAt: past, done: true },
      },
    ]);
    expect(
      await installed.tool("list-due").call({ now: new Date().toISOString() }),
    ).toEqual({ ok: true, data: { ids: ["due"] } });
    expect(
      await harness.request(dueCount, { now: new Date().toISOString() }),
    ).toEqual({ ok: true, data: { count: 1 } });
    expect(await harness.fetch("GET", "/reminders/due")).toEqual({
      ids: ["due"],
    });
    expect(harness.templateNames()).toEqual(["due-list"]);
    expect(harness.formatTemplate("due-list", { contents: ["Call Sam"] })).toBe(
      "Call Sam",
    );
  } finally {
    await harness.reset();
  }
});

test("fire enqueues durable work; one attempt updates content and runtime state", async () => {
  const harness = createBrainTestHarness();
  try {
    const installed = await harness.installPackage(reminders);
    await harness.finalizeRegistration();
    await installed
      .tool("add")
      .call({ id: "call", content: "Call Sam", dueAt: past });
    expect(await installed.tool("fire").call({ id: "call" })).toMatchObject({
      ok: true,
      data: { jobId: expect.any(String) },
    });
    expect(await installed.job("fire").run({ id: "call" })).toEqual({
      fired: true,
      total: 1,
      text: "Call Sam",
    });
    expect(await installed.job("fire").run({ id: "call" })).toEqual({
      fired: false,
      total: 1,
      text: "Call Sam",
    });
    expect(await harness.getEntity(reminder.type, "call")).toMatchObject({
      content: "Call Sam",
      metadata: { done: true },
    });
    expect(
      await harness.request(dueCount, { now: new Date().toISOString() }),
    ).toEqual({ ok: true, data: { count: 0 } });
  } finally {
    await harness.reset();
  }
});

test("missing local names explain choices and tool diagnostics retain the cause", async () => {
  const harness = createBrainTestHarness();
  try {
    const installed = await harness.installPackage(reminders);
    await harness.finalizeRegistration();
    expect(() => installed.tool("missing")).toThrow("list-due");
    expect(() => installed.job("missing")).toThrow("fire");
    expect(() => harness.formatTemplate("missing", {})).toThrow("due-list");
    expect(
      await installed
        .tool("add")
        .call({ id: "bad", content: "Call Sam", dueAt: "not-a-date" }),
    ).toMatchObject({
      ok: false,
      code: "invalid_input",
      cause: expect.any(Error),
    });
  } finally {
    await harness.reset();
  }
});
