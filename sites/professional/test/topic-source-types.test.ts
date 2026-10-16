import { describe, expect, it } from "bun:test";
import { TOPIC_SOURCE_TYPES_MESSAGE } from "@brains/contracts";
import { loadTopicSourceTypes } from "../src/datasources/topic-source-types";

describe("topic source types for the atlas", () => {
  it("asks the topics plugin which types topics are drawn from", async () => {
    const asked: string[] = [];
    const types = await loadTopicSourceTypes({
      send: async (message) => {
        asked.push(message.type);
        return { success: true, data: { types: ["post", "deck"] } };
      },
    });

    expect(asked).toEqual([TOPIC_SOURCE_TYPES_MESSAGE]);
    expect(types).toEqual(["post", "deck"]);
  });

  it("draws from no sources when no topics plugin answers", async () => {
    expect(
      await loadTopicSourceTypes({ send: async () => ({ noop: true }) }),
    ).toEqual([]);
    expect(
      await loadTopicSourceTypes({
        send: async () => {
          throw new Error("no route");
        },
      }),
    ).toEqual([]);
  });
});
