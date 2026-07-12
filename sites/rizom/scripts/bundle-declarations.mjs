import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { dts } from "rolldown-plugin-dts";

const require = createRequire(import.meta.url);
const packageDir = join(dirname(fileURLToPath(import.meta.url)), "..");

// dts must see @rizom/ui's TypeScript source; the package exports it
// directly, so workspace resolution lands on src/index.ts.
const aliases = new Map([["@rizom/ui", require.resolve("@rizom/ui")]]);

export default {
  cwd: packageDir,
  input: process.env.INPUT,
  output: { dir: process.env.OUTPUT_DIR, format: "es" },
  // Rolldown's JS transform should not try to discover tsconfigs for virtual
  // declaration modules; declaration generation uses the plugin tsconfig below.
  tsconfig: false,
  plugins: [
    {
      name: "site-rizom-dts-alias",
      resolveId(source) {
        return aliases.get(source) ?? null;
      },
    },
    ...dts({
      cwd: packageDir,
      emitDtsOnly: true,
      generator: "oxc",
      tsconfig: "tsconfig.json",
      compilerOptions: { stripInternal: true },
    }),
  ],
};
