import { resolve } from "node:path";
import process from "node:process";
import { dts } from "rolldown-plugin-dts";

export default {
  cwd: resolve(import.meta.dirname, ".."),
  input: { index: "src/public.ts" },
  output: { dir: process.env.OUTPUT_DIR, format: "es" },
  tsconfig: false,
  plugins: dts({
    emitDtsOnly: true,
    generator: "oxc",
    tsconfig: "tsconfig.json",
    compilerOptions: { stripInternal: true },
  }),
};
