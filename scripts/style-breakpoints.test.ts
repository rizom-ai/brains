import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Glob } from "bun";
import { consoleBreakpoints } from "@brains/app-ui-react/breakpoints";

const root = join(import.meta.dir, "..");
/** Packages whose StyleX at-rules come from the console breakpoints. */
const styled = [
  "shared/app-ui-react/src",
  "shared/operator-view-react/src",
  "plugins/studio/ui-react/src",
];
const allowed = new Set<string>(Object.values(consoleBreakpoints));

describe("console style breakpoints", () => {
  test("every media and container condition is a console breakpoint", () => {
    const strays = styled.flatMap((dir) =>
      Array.from(new Glob("**/*.{ts,tsx}").scanSync(join(root, dir)))
        .filter((file) => !/\.test\.tsx?$/.test(file))
        .flatMap((file) =>
          (
            readFileSync(join(root, dir, file), "utf8").match(
              /"@(?:media|container)[^"]*"/g,
            ) ?? []
          )
            .map((quoted) => quoted.slice(1, -1))
            .filter((condition) => !allowed.has(condition))
            .map((condition) => `${dir}/${file}: ${condition}`),
        ),
    );

    expect(strays).toEqual([]);
  });
});
