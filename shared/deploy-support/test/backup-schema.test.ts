import { describe, expect, it } from "bun:test";
import {
  parseBackupRuntimeEnvironment,
  parseTursoBackupManifest,
} from "../src/backup-schema";
import { TURSO_BACKUP_DATABASE_NAMES } from "../src/deploy-scripts/turso-backup";

function manifest(): Record<string, unknown> {
  const databases = TURSO_BACKUP_DATABASE_NAMES.map((name) => ({
    name,
    sha256: "0".repeat(64),
  }));
  const names = [
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
  return {
    schemaVersion: 2,
    sourceVersion: "0.3.0",
    imageId: "image",
    outcome: "verified",
    engine: "turso",
    capture: "all-writers-stopped",
    restoreVerified: true,
    git: { head: "a".repeat(40), branch: "main" },
    databases,
    artifacts: [
      ...databases,
      ...names.map((name) => ({ name, sha256: "0".repeat(64) })),
    ],
  };
}

describe("shared backup validation", () => {
  it("requires a complete same-engine restore contract", () => {
    expect(parseTursoBackupManifest(manifest()).databases).toHaveLength(5);
    for (const patch of [
      { schemaVersion: 1 },
      { sourceVersion: "0.2.0" },
      { restoreVerified: false },
      { artifacts: [] },
      { databases: [] },
      { engine: "libsql" },
      { git: { head: "a".repeat(41), branch: "main" } },
    ]) {
      expect(() =>
        parseTursoBackupManifest({ ...manifest(), ...patch }),
      ).toThrow("Expected a complete, verified Turso snapshot manifest");
    }
  });
  it("rejects traversal, duplicate artifacts and inconsistent evidence", () => {
    const valid = parseTursoBackupManifest(manifest());
    for (const artifacts of [
      [...valid.artifacts, { name: "../outside", sha256: "0".repeat(64) }],
      [...valid.artifacts, { name: "auth.db", sha256: "0".repeat(64) }],
    ]) {
      expect(() =>
        parseTursoBackupManifest({ ...manifest(), artifacts }),
      ).toThrow();
    }
    expect(() =>
      parseTursoBackupManifest({
        ...manifest(),
        databases: TURSO_BACKUP_DATABASE_NAMES.map((name) => ({
          name,
          sha256: "1".repeat(64),
        })),
      }),
    ).toThrow();
  });
  it("preserves multiline environment values without exposing invalid secret input", () => {
    expect(parseBackupRuntimeEnvironment(["KEY=line1\nline2=tail"])).toEqual([
      "KEY=line1\nline2=tail",
    ]);
    for (const input of [
      ["KEY=secret-marker", "KEY=duplicate-secret"],
      { secret: "secret-marker" },
      ["secret-marker"],
    ]) {
      expect(() => parseBackupRuntimeEnvironment(input)).toThrow(
        "Invalid runtime environment snapshot",
      );
    }
  });
});
