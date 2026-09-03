import { readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";

const RUNTIME_OWNER_FILE = ".brain-runtime-owner.json";

const runtimeOwnerSchema = z.strictObject({
  address: z.string().min(1),
  secret: z.string().min(32),
});

export interface RuntimeOwnerDescriptor {
  readonly address: string;
  readonly secret: string;
}

export function runtimeOwnerPath(cwd: string): string {
  return join(cwd, RUNTIME_OWNER_FILE);
}

/** Publish the ready owner's local capability through a user-only file. */
export function writeRuntimeOwner(
  cwd: string,
  descriptor: RuntimeOwnerDescriptor,
): void {
  const parsed = runtimeOwnerSchema.parse(descriptor);
  const path = runtimeOwnerPath(cwd);
  const temporary = `${path}.${process.pid}.tmp`;
  writeFileSync(temporary, `${JSON.stringify(parsed)}\n`, { mode: 0o600 });
  renameSync(temporary, path);
}

export function readRuntimeOwner(
  cwd: string,
): RuntimeOwnerDescriptor | undefined {
  try {
    return runtimeOwnerSchema.parse(
      JSON.parse(readFileSync(runtimeOwnerPath(cwd), "utf8")),
    );
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "ENOENT"
    ) {
      return undefined;
    }
    throw error;
  }
}

/** Remove only this supervisor's descriptor, never a replacement owner's. */
export function removeRuntimeOwner(
  cwd: string,
  descriptor: RuntimeOwnerDescriptor,
): void {
  const current = readRuntimeOwner(cwd);
  if (
    current?.address === descriptor.address &&
    current.secret === descriptor.secret
  ) {
    rmSync(runtimeOwnerPath(cwd), { force: true });
  }
}
