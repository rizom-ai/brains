import { describe, expect, it } from "bun:test";
import { defineBusContract, type BusContract } from "@brains/contracts";
import { z } from "@brains/utils/zod";
import { createBasePluginContext } from "../src/base/context";
import { createMockShell } from "../src/test/mock-shell";

const requestSchema = z.strictObject({ text: z.string().min(1) });
const responseSchema = z.strictObject({ length: z.number() });

const measure: BusContract<
  typeof requestSchema,
  typeof responseSchema,
  "request"
> = defineBusContract({
  channel: "test:measure",
  request: requestSchema,
  response: responseSchema,
  delivery: "request",
});

describe("bus contracts", () => {
  it("answers a request with the owner's validated reply", async () => {
    const shell = createMockShell();
    createBasePluginContext(shell, "owner").messaging.answer(
      measure,
      async ({ text }) => ({ length: text.length }),
    );

    const result = await createBasePluginContext(
      shell,
      "caller",
    ).messaging.request(measure, { text: "four" });

    expect(result).toEqual({ status: "answered", data: { length: 4 } });
  });

  it("reports an uninstalled owner as unavailable", async () => {
    const result = await createBasePluginContext(
      createMockShell(),
      "caller",
    ).messaging.request(measure, { text: "four" });

    expect(result).toEqual({ status: "unavailable" });
  });

  it("refuses an invalid request before the owner's handler runs", async () => {
    const shell = createMockShell();
    const seen: unknown[] = [];
    createBasePluginContext(shell, "owner").messaging.answer(
      measure,
      async (request) => {
        seen.push(request);
        return { length: 0 };
      },
    );

    const response = await shell
      .getMessageBus()
      .send({ type: measure.name, payload: { text: "" }, sender: "raw" });

    expect(seen).toEqual([]);
    expect(response).toMatchObject({ success: false });
  });

  it("turns a reply outside the contract into a failure", async () => {
    const shell = createMockShell();
    createBasePluginContext(shell, "owner").messaging.answer(
      measure,
      // A handler typed loosely elsewhere can still answer out of contract.
      async () => JSON.parse('{"length":"four"}'),
    );

    const result = await createBasePluginContext(
      shell,
      "caller",
    ).messaging.request(measure, { text: "four" });

    expect(result).toMatchObject({ status: "failed" });
  });

  it("reports a throwing owner as a failure, not as absent", async () => {
    const shell = createMockShell();
    createBasePluginContext(shell, "owner").messaging.answer(
      measure,
      async () => {
        throw new Error("disk full");
      },
    );

    const result = await createBasePluginContext(
      shell,
      "caller",
    ).messaging.request(measure, { text: "four" });

    expect(result).toEqual({ status: "failed", error: "disk full" });
  });

  it("refuses a second owner for a request contract", () => {
    const shell = createMockShell();
    createBasePluginContext(shell, "first").messaging.answer(
      measure,
      async () => ({ length: 1 }),
    );

    expect(() =>
      createBasePluginContext(shell, "second").messaging.answer(
        measure,
        async () => ({ length: 2 }),
      ),
    ).toThrow("test:measure already has an owner");
  });
});

const announceSchema = z.strictObject({ entityType: z.string() });
const announce: BusContract<typeof announceSchema, z.ZodVoid, "command"> =
  defineBusContract({
    channel: "test:announce",
    request: announceSchema,
    response: z.void(),
    delivery: "command",
  });

describe("command contracts through the context", () => {
  it("reach every plugin that hears them", async () => {
    const shell = createMockShell();
    const heard: string[] = [];
    for (const pluginId of ["newsletter", "social-media"]) {
      createBasePluginContext(shell, pluginId).messaging.answer(
        announce,
        async ({ entityType }) => {
          heard.push(`${pluginId}:${entityType}`);
        },
      );
    }

    await createBasePluginContext(shell, "content-pipeline").messaging.command(
      announce,
      { entityType: "post" },
    );

    expect(heard.sort()).toEqual(["newsletter:post", "social-media:post"]);
  });
});
