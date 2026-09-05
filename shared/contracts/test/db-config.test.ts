import { describe, expect, test } from "bun:test";
import { dbConfigSchema } from "../src/db-config";

describe("runtime database configuration", () => {
  test("accepts local file and in-memory Turso URLs", () => {
    for (const url of [
      "file:./data/brain.db",
      "file:///srv/brain.db",
      "file::memory:",
    ]) {
      expect(dbConfigSchema.parse({ url })).toEqual({ url });
    }
  });

  test("rejects remote URLs and retired credentials or engine overrides", () => {
    for (const input of [
      { url: "libsql://example.turso.io" },
      { url: "https://example.turso.io" },
      { url: "file:./data/brain.db", authToken: "retired" },
      { url: "file:./data/brain.db", engine: "libsql" },
    ]) {
      expect(dbConfigSchema.safeParse(input).success).toBe(false);
    }
  });
});
