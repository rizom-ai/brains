import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { dts } from "rolldown-plugin-dts";

const packageDir = join(dirname(fileURLToPath(import.meta.url)), "..");

export default {
  cwd: packageDir,
  input: process.env.INPUT,
  output: { dir: process.env.OUTPUT_DIR, format: "es" },
  // Rolldown's JS transform should not try to discover tsconfigs for virtual
  // declaration modules; declaration generation uses the plugin tsconfig below.
  tsconfig: false,
  plugins: [
    ...dts({
      cwd: packageDir,
      emitDtsOnly: true,
      generator: "oxc",
      tsconfig: "tsconfig.json",
      compilerOptions: { stripInternal: true },
    }),
  ],
};
