import { describe, expect, it } from "bun:test";
import { defineBusContract, type BusContract } from "@brains/contracts";
import { createSilentLogger } from "@brains/test-utils";
import { z } from "@brains/utils/zod";
import { MessageBus } from "../src";
import { answerContract, collectContract } from "../src/bus-contracts";

const questionSchema = z.strictObject({ topic: z.string() });
const itemSchema = z.strictObject({ source: z.string(), text: z.string() });

const gather: BusContract<typeof questionSchema, typeof itemSchema, "collect"> =
  defineBusContract({
    channel: "test:gather",
    request: questionSchema,
    response: itemSchema,
    delivery: "collect",
  });

function bus(): MessageBus {
  return MessageBus.createFresh(createSilentLogger("bus-contracts"));
}

describe("collect contracts", () => {
  it("gathers every owner's validated answer, in registration order", async () => {
    const messageBus = bus();
    const logger = createSilentLogger("owners");
    for (const source of ["memory", "playbooks"]) {
      answerContract(
        messageBus,
        gather,
        async ({ topic }) => ({ source, text: `${source} on ${topic}` }),
        { owner: source, logger },
      );
    }

    const result = await collectContract(
      messageBus,
      gather,
      { topic: "launch" },
      "shell",
    );

    expect(result).toEqual({
      status: "answered",
      answers: [
        { source: "memory", text: "memory on launch" },
        { source: "playbooks", text: "playbooks on launch" },
      ],
      failures: [],
    });
  });

  it("keeps the valid answers when one owner answers outside the contract", async () => {
    const messageBus = bus();
    const logger = createSilentLogger("owners");
    answerContract(
      messageBus,
      gather,
      async () => ({ source: "memory", text: "kept" }),
      { owner: "memory", logger },
    );
    answerContract(
      messageBus,
      gather,
      async () => JSON.parse('{"source":"broken"}'),
      { owner: "broken", logger },
    );

    const result = await collectContract(
      messageBus,
      gather,
      { topic: "launch" },
      "shell",
    );

    expect(result).toMatchObject({
      status: "answered",
      answers: [{ source: "memory", text: "kept" }],
    });
    expect(result.status === "answered" && result.failures).toHaveLength(1);
  });

  it("reports a contract no plugin answers as unavailable", async () => {
    expect(
      await collectContract(bus(), gather, { topic: "launch" }, "shell"),
    ).toEqual({ status: "unavailable" });
  });
});
