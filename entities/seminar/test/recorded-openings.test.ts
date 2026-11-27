import { describe, expect, it } from "bun:test";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { a2aPeerAnswerSchema, type A2APeerAnswer } from "@brains/contracts";
import { z } from "@brains/utils/zod";
import { holdSeminar } from "../src/handlers/seminar-hold-handler";
import { readSeminar } from "../src/lib/seminar-body";

/**
 * The openings karl., friedrich. and sigmund.rizom.ai gave on 27 November
 * 2026 to "What should a community remember, and what should it forget?",
 * as the A2A turn path returned them.
 */
const recorded = z
  .record(z.string(), a2aPeerAnswerSchema)
  .parse(
    JSON.parse(
      await readFile(
        join(import.meta.dir, "fixtures", "openings-remember-and-forget.json"),
        "utf8",
      ),
    ),
  );

describe("a seminar held from the three brains' recorded openings", () => {
  it("stores each opening as the brain gave it, with every source it returned", async () => {
    const stored: Array<{
      content: string;
      metadata: Record<string, unknown>;
    }> = [];

    await holdSeminar(
      {
        peers: async () =>
          Object.keys(recorded).map((id) => ({
            id,
            name: id.split(".")[0] ?? id,
          })),
        askTurn: async (agent): Promise<A2APeerAnswer> => {
          const answer = recorded[agent];
          if (!answer) throw new Error(`no recorded opening for ${agent}`);
          return answer;
        },
        chair: {
          challenge: async (): Promise<never> => {
            throw new Error("no exchange in this test");
          },
          rejoinder: async (): Promise<never> => {
            throw new Error("no exchange in this test");
          },
        },
        exists: async () => false,
        create: async (seminar): Promise<string> => {
          stored.push(seminar);
          return seminar.id;
        },
        today: () => "2026-11-27",
      },
      {
        question:
          "What should a community remember, and what should it forget?",
        language: "English",
      },
    );

    const [seminar] = stored;
    if (!seminar) throw new Error("no seminar written");
    const turns = readSeminar(seminar).turns.filter(
      ({ round }) => round === "opening",
    );
    expect(turns.map((turn) => turn.speaker)).toEqual([
      "friedrich.rizom.ai",
      "karl.rizom.ai",
      "sigmund.rizom.ai",
    ]);
    for (const turn of turns) {
      const answer = recorded[turn.speaker];
      expect(turn.text).toBe(answer?.response.trim());
      expect(turn.sources?.map((source) => source.id)).toEqual(
        answer?.sources.map((source) => source.id),
      );
      // Every source links to its section on its author's brain.
      for (const source of turn.sources ?? []) {
        expect(source.url?.startsWith(`https://${turn.speaker}/books/`)).toBe(
          true,
        );
      }
    }
  });
});
