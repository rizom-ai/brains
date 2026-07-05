import { resolve } from "node:path";
import dts from "rollup-plugin-dts";

const root = resolve(import.meta.dirname, "../../..");

const aliases = new Map([
  ["@rizom/ui", resolve(root, "shared/rizom-ui/src/index.ts")],
]);

export default {
  input: process.env.INPUT,
  output: { file: process.env.OUTPUT, format: "es" },
  plugins: [
    {
      name: "site-rizom-dts-alias",
      resolveId(source) {
        return aliases.get(source) ?? null;
      },
    },
    dts({ respectExternal: false, compilerOptions: { stripInternal: true } }),
  ],
};
