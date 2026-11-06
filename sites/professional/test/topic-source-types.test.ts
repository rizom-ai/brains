import { describe, expect, it } from "bun:test";
import { topicSourceTypesContract } from "@brains/contracts";
import { loadTopicSourceTypes } from "../src/datasources/topic-source-types";

describe("topic source types for the atlas", () => {
  it("asks the topics plugin which types topics are drawn from", async () => {
    const asked: string[] = [];
    const types = await loadTopicSourceTypes({
      request: async (contract) => {
        asked.push(contract.name);
        return { status: "answered", data: { types: ["post", "deck"] } };
      },
    });

    expect(asked).toEqual([topicSourceTypesContract.name]);
    expect(types).toEqual(["post", "deck"]);
  });

  it("draws from no sources when no topics plugin answers", async () => {
    expect(
      await loadTopicSourceTypes({
        request: async () => ({ status: "unavailable" }),
      }),
    ).toEqual([]);
    expect(
      await loadTopicSourceTypes({
        request: async () => ({ status: "failed", error: "no route" }),
      }),
    ).toEqual([]);
    expect(
      await loadTopicSourceTypes({
        request: async () => {
          throw new Error("no route");
        },
      }),
    ).toEqual([]);
  });
});
