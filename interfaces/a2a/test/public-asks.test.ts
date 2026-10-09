import { describe, expect, it } from "bun:test";
import { createMemoryRuntimeStateNamespace } from "@brains/plugins/test";
import { a2aConfigSchema } from "../src/config";
import {
  publicAsksConfigSchema,
  RuntimePublicAskAllowance,
} from "../src/public-asks";

const DAY = 86_400_000;
const T0 = Date.parse("2026-10-09T10:00:00.000Z");

function allowance(
  config: Partial<ReturnType<typeof publicAsksConfigSchema.parse>> = {},
  clock: { now: number } = { now: T0 },
): RuntimePublicAskAllowance {
  return new RuntimePublicAskAllowance(
    publicAsksConfigSchema.parse(config),
    createMemoryRuntimeStateNamespace(),
    { now: () => clock.now },
  );
}

async function admitTimes(
  asks: RuntimePublicAskAllowance,
  caller: string | null,
  times: number,
): Promise<void> {
  await Array.from({ length: times }).reduce(
    (previous: Promise<unknown>) =>
      previous.then(async () => {
        const admission = await asks.admit(caller);
        if (!admission.ok) throw new Error(admission.reason);
      }),
    Promise.resolve(),
  );
}

describe("public ask allowance", () => {
  it("has modest defaults and is on, also when the interface config omits it", () => {
    const defaults = {
      enabled: true,
      perCallerPerDay: 60,
      perDay: 600,
      tokensPerCallerPerDay: 300_000,
      tokensPerDay: 3_000_000,
    };
    expect(publicAsksConfigSchema.parse({})).toEqual(defaults);
    expect(a2aConfigSchema.parse({}).publicAsks).toEqual(defaults);
    expect(
      a2aConfigSchema.parse({ publicAsks: { enabled: false } }).publicAsks,
    ).toEqual({ ...defaults, enabled: false });
  });

  it("admits a caller until its daily count is reached", async () => {
    const asks = allowance({ perCallerPerDay: 2 });
    await admitTimes(asks, "jo.example", 2);
    expect(await asks.admit("jo.example")).toEqual({
      ok: false,
      reason:
        "jo.example has reached today's allowance of 2 public questions on this brain.",
    });
    expect(await asks.admit("sam.example")).toEqual({ ok: true });
  });

  it("caps the day for everyone together", async () => {
    const asks = allowance({ perCallerPerDay: 5, perDay: 3 });
    await admitTimes(asks, "jo.example", 2);
    await admitTimes(asks, "sam.example", 1);
    expect(await asks.admit("kai.example")).toEqual({
      ok: false,
      reason:
        "This brain has reached today's allowance of public questions; ask again tomorrow.",
    });
  });

  it("stops a caller whose answers have used today's tokens", async () => {
    const asks = allowance({ tokensPerCallerPerDay: 1_000 });
    await admitTimes(asks, "jo.example", 1);
    await asks.settle("jo.example", 1_000);
    expect(await asks.admit("jo.example")).toEqual({
      ok: false,
      reason:
        "jo.example has used today's allowance of answer tokens on this brain.",
    });
    expect(await asks.admit("sam.example")).toEqual({ ok: true });
  });

  it("stops everyone when the day's tokens are used", async () => {
    const asks = allowance({ tokensPerDay: 1_000 });
    await admitTimes(asks, "jo.example", 1);
    await asks.settle("jo.example", 600);
    await admitTimes(asks, "sam.example", 1);
    await asks.settle("sam.example", 400);
    expect(await asks.admit("kai.example")).toEqual({
      ok: false,
      reason:
        "This brain has used today's allowance of answer tokens for public questions; ask again tomorrow.",
    });
  });

  it("pools unsigned callers as one anonymous caller", async () => {
    const asks = allowance({ perCallerPerDay: 1 });
    await admitTimes(asks, null, 1);
    expect(await asks.admit(null)).toEqual({
      ok: false,
      reason:
        "anonymous has reached today's allowance of 1 public question on this brain.",
    });
    expect(await asks.admit("jo.example")).toEqual({ ok: true });
  });

  it("starts over at midnight UTC", async () => {
    const clock = { now: T0 };
    const asks = allowance({ perCallerPerDay: 1 }, clock);
    await admitTimes(asks, "jo.example", 1);
    expect(await asks.admit("jo.example")).toMatchObject({ ok: false });
    clock.now = T0 + DAY;
    expect(await asks.admit("jo.example")).toEqual({ ok: true });
  });

  it("refuses everyone while switched off", async () => {
    const asks = allowance({ enabled: false });
    expect(await asks.admit("jo.example")).toEqual({
      ok: false,
      reason:
        "This brain is not answering public questions over A2A at the moment.",
    });
  });
});
