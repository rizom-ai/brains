import { expect, test } from "bun:test";
import { fileURLToPath } from "node:url";
import {
  entityGroupingSchema,
  groupingKeySchema,
} from "../../src/contracts/grouping";

test("grouping contracts validate declarations without a runtime owner", () => {
  expect(
    entityGroupingSchema.parse({
      key: "clients",
      label: "Clients",
      field: "clients",
      types: ["note"],
    }).key,
  ).toBe("clients");
  expect(groupingKeySchema.safeParse("").success).toBe(false);
});

test("grouping contracts bundle for browsers without native persistence imports", async () => {
  const forbidden: string[] = [];
  const result = await Bun.build({
    entrypoints: [
      fileURLToPath(
        new URL("../../src/contracts/grouping.ts", import.meta.url),
      ),
    ],
    target: "browser",
    plugins: [
      {
        name: "no-native-grouping-contracts",
        setup(build): void {
          build.onResolve(
            { filter: /^(?:node:|bun:|@brains\/db(?:\/|$)|@tursodatabase\/)/ },
            (args) => {
              forbidden.push(args.path);
              throw new Error(
                `Browser contract imported native runtime: ${args.path}`,
              );
            },
          );
        },
      },
    ],
  });
  expect(result.success).toBe(true);
  expect(forbidden).toEqual([]);
});
