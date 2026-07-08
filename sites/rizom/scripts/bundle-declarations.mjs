import { createRequire } from "node:module";
import dts from "rollup-plugin-dts";

const require = createRequire(import.meta.url);

// dts must see @rizom/ui's TypeScript source; the package exports it
// directly, so workspace resolution lands on src/index.ts.
const aliases = new Map([["@rizom/ui", require.resolve("@rizom/ui")]]);

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
