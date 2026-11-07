// This package's own test, run as test/reminders.test.ts from the package's
// directory: the test brain runs the package that directory's manifest names.
import { describe, expect, it } from "bun:test";
import { use } from "@rizom/brain";
import { z, type ServiceJobStatus } from "@rizom/brain/services";
import { startTestBrain, type TestBrain } from "@rizom/brain/testing";
import reminders, { dueCount, fireReminder, reminder } from "../src/index";

const past = "2000-01-01T00:00:00.000Z";
const later = "2999-01-01T00:00:00.000Z";

// What the fire tool answers: the job it queued.
const queued = z.object({
  success: z.literal(true),
  data: z.object({ jobId: z.string() }),
});

async function add(brain: TestBrain, id: string, dueAt: string): Promise<void> {
  expect(
    await brain.tool("reminders_add", {
      id,
      content: `Reminder ${id}`,
      dueAt,
    }),
  ).toEqual({ success: true, data: { id } });
}

/** Queue a reminder's delivery, and wait for the brain's worker to run it. */
async function fire(
  brain: TestBrain,
  id: string,
): Promise<ServiceJobStatus<z.output<typeof fireReminder.output>> | null> {
  const { data } = queued.parse(await brain.tool("reminders_fire", { id }));
  return brain.jobs.wait(fireReminder, data.jobId);
}

/** One reminder due, one delivered already, one due later. */
async function seed(brain: TestBrain): Promise<void> {
  await add(brain, "due", past);
  await add(brain, "done", past);
  await fire(brain, "done");
  await add(brain, "upcoming", later);
}

async function withBrain(
  test: (brain: TestBrain) => Promise<void>,
): Promise<void> {
  const brain = await startTestBrain({ plugins: [use(reminders)] });
  try {
    await test(brain);
  } finally {
    await brain.stop();
  }
}

describe("the reminders package", () => {
  it("adds a reminder as owned, typed content", () =>
    withBrain(async (brain) => {
      expect(
        await brain.tool("reminders_add", {
          id: "call",
          content: "Call Sam",
          dueAt: past,
        }),
      ).toEqual({ success: true, data: { id: "call" } });
      const stored = await brain.entities.get(reminder, "call");
      expect(stored?.content).toBe("Call Sam");
      expect(stored?.metadata).toEqual({ dueAt: past, done: false });
    }));

  it("agrees on what is due through its tool, contract and route", () =>
    withBrain(async (brain) => {
      await seed(brain);
      const now = new Date().toISOString();

      expect(await brain.tool("reminders_list-due", { now })).toEqual({
        success: true,
        data: { ids: ["due"] },
      });
      expect(await brain.request(dueCount, { now })).toEqual({
        status: "answered",
        data: { count: 1 },
      });
      const answer = await brain.fetch(
        new Request("https://brain.test/reminders/due"),
      );
      expect(answer.status).toBe(200);
      expect(await answer.json()).toEqual({ ids: ["due"] });
    }));

  it("delivers a reminder once, counting deliveries in its own state", () =>
    withBrain(async (brain) => {
      await add(brain, "due", past);

      expect(await fire(brain, "due")).toMatchObject({
        status: "completed",
        result: { fired: true, total: 1, text: "Reminder due" },
      });
      expect(await fire(brain, "due")).toMatchObject({
        status: "completed",
        result: { fired: false, total: 1, text: "Reminder due" },
      });
      const delivered = await brain.entities.get(reminder, "due");
      expect(delivered?.metadata).toEqual({ dueAt: past, done: true });
    }));

  it("fails to deliver a missing reminder with its code", () =>
    withBrain(async (brain) => {
      const failed = await fire(brain, "missing");

      expect(failed).toMatchObject({ code: "not_found", error: "Not found" });
      expect(JSON.stringify(failed)).not.toContain("missing");
    }));
});
