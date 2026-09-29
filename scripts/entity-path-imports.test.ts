import { describe, expect, test } from "bun:test";
import { createRequire } from "node:module";
import { Linter } from "eslint";
import { z } from "@brains/utils/zod";

const restrictedImports = z.tuple([
  z.literal("error"),
  z.object({
    paths: z.array(
      z.object({
        name: z.string(),
        message: z.string(),
        allowImportNames: z.array(z.string()).optional(),
      }),
    ),
    patterns: z.array(
      z.object({ group: z.array(z.string()), message: z.string() }),
    ),
  }),
]);
const config = z
  .object({
    overrides: z.array(
      z.object({
        rules: z.object({ "no-restricted-imports": restrictedImports }),
      }),
    ),
  })
  .parse(createRequire(import.meta.url)("../shared/eslint-config/index.js"));
const rule = config.overrides[0]?.rules["no-restricted-imports"];
if (!rule) throw new Error("Missing shell import boundary rule");
const linter = new Linter();

function violations(code: string): number {
  const messages = linter.verify(code, [
    { rules: { "no-restricted-imports": rule } },
  ]);
  const fatal = messages.filter((message) => message.fatal);
  expect(fatal).toEqual([]);
  return messages.filter(
    (message) => message.ruleId === "no-restricted-imports",
  ).length;
}

describe("entity-path codec import boundary", () => {
  test("allows only the named codec functions at the package boundary", () => {
    expect(
      violations(
        'import { decodeEntityIdPath, encodeEntityIdPath } from "@brains/entity-service";',
      ),
    ).toBe(0);
  });
  test.each([
    'import { EntityService } from "@brains/entity-service";',
    'import { decodeEntityIdPath, EntityService } from "@brains/entity-service";',
    'import * as entities from "@brains/entity-service";',
    'import entities from "@brains/entity-service";',
    'import { decodeEntityIdPath } from "@brains/entity-service/src/entity-id-path";',
    'import { JobQueueService } from "@brains/job-queue";',
  ])("still restricts %s", (code) => {
    expect(violations(code)).toBeGreaterThan(0);
  });
});
