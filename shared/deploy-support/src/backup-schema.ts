import { z } from "@brains/utils/zod";
import { TURSO_BACKUP_DATABASE_NAMES } from "./deploy-scripts/turso-backup";

export interface TursoBackupRestoreManifest {
  git: { head: string; branch: string };
  databases: Array<{ name: string; sha256: string }>;
  artifacts: Array<{ name: string; sha256: string }>;
}

const artifactSchema = z.object({
  name: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._-]*$/),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
});
const artifactListSchema = z
  .array(artifactSchema)
  .refine(
    (items) => new Set(items.map((item) => item.name)).size === items.length,
    "Duplicate backup artifact",
  );
const requiredArtifacts = [
  ...TURSO_BACKUP_DATABASE_NAMES,
  "brain.yaml",
  "runtime-environment.json",
  "runtime-config.tar",
  "content.bundle",
  "content-status.txt",
  "content-refs.txt",
  "content-staged.patch",
  "content-unstaged.patch",
  "content-untracked.tar",
  "content-ignored.tar",
  "content-untracked.zlist",
  "content-ignored.zlist",
];
const manifestSchema = z
  .object({
    schemaVersion: z.literal(2),
    sourceVersion: z.string().regex(/^0\.3\./),
    imageId: z.string().min(1),
    outcome: z.literal("verified"),
    engine: z.literal("turso"),
    capture: z.literal("all-writers-stopped"),
    restoreVerified: z.literal(true),
    git: z.object({
      head: z.string().regex(/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/),
      branch: z.string().min(1),
    }),
    databases: artifactListSchema,
    artifacts: artifactListSchema,
  })
  .refine((manifest) => {
    const names = manifest.databases.map((db) => db.name).sort();
    return (
      JSON.stringify(names) ===
        JSON.stringify([...TURSO_BACKUP_DATABASE_NAMES].sort()) &&
      requiredArtifacts.every((name) =>
        manifest.artifacts.some((item) => item.name === name),
      ) &&
      manifest.databases.every((db) =>
        manifest.artifacts.some(
          (item) => item.name === db.name && item.sha256 === db.sha256,
        ),
      )
    );
  }, "Snapshot is incomplete or its database evidence disagrees");

/** Public deploy boundary: callers need not import Zod or workspace internals. */
export function parseTursoBackupManifest(
  value: unknown,
): TursoBackupRestoreManifest {
  const parsed = manifestSchema.safeParse(value);
  if (!parsed.success)
    throw new Error("Expected a complete, verified Turso snapshot manifest");
  return {
    git: parsed.data.git,
    databases: parsed.data.databases,
    artifacts: parsed.data.artifacts,
  };
}

const environmentSchema = z
  .array(z.string().regex(/^[A-Za-z_][A-Za-z0-9_]*=/))
  .refine(
    (entries) =>
      new Set(entries.map((entry) => entry.slice(0, entry.indexOf("="))))
        .size === entries.length,
  );
export function parseBackupRuntimeEnvironment(value: unknown): string[] {
  const parsed = environmentSchema.safeParse(value);
  // Never include validation input or issue details from a secret-bearing file.
  if (!parsed.success) throw new Error("Invalid runtime environment snapshot");
  return parsed.data;
}
