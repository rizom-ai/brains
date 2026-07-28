import { describe, expect, it } from "bun:test";
import { join } from "node:path";
import { YAMLLoader } from "../src/loaders/yaml-loader";

const expectedCallerStates = new Map<
  string,
  {
    permissionLevel: "admin" | "trusted" | "public";
    isAnchor: boolean;
  }
>([
  [
    "shell-anchor-admin-caller-context",
    { permissionLevel: "admin", isAnchor: true },
  ],
  [
    "shell-trusted-non-anchor-caller-context",
    { permissionLevel: "trusted", isAnchor: false },
  ],
  [
    "shell-additional-admin-non-anchor-caller-context",
    { permissionLevel: "admin", isAnchor: false },
  ],
  [
    "shell-public-permission-label",
    { permissionLevel: "public", isAnchor: false },
  ],
]);

describe("caller-context behavioral evaluations", () => {
  it("loads every production-valid permission and Anchor state", async () => {
    const loader = YAMLLoader.createFresh({
      directory: join(
        import.meta.dir,
        "..",
        "evals",
        "test-cases",
        "response-quality",
      ),
    });
    const testCases = await loader.loadTestCases();
    const byId = new Map(testCases.map((testCase) => [testCase.id, testCase]));

    for (const [id, expectedSetup] of expectedCallerStates) {
      const testCase = byId.get(id);
      expect(testCase?.type).not.toBe("plugin");
      if (!testCase || testCase.type === "plugin") {
        throw new Error(`Missing caller-context evaluation ${id}`);
      }
      expect(testCase.setup).toEqual(expectedSetup);
      expect(testCase.turns.length).toBeGreaterThan(0);
    }
  });
});
