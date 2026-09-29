import { parseArgs } from "node:util";

/** Shared CLI parsing for package-owned UI build scripts. */
export function parseUiBuildArgs(args: string[] = process.argv.slice(2)): {
  outdir?: string;
} {
  const { values } = parseArgs({
    args,
    options: { outdir: { type: "string" } },
  });
  return values.outdir === undefined ? {} : { outdir: values.outdir };
}
