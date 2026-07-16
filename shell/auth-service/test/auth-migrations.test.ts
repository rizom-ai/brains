import { describe, expect, it } from "bun:test";

const packageJson = (await Bun.file("package.json").json()) as {
  scripts?: Record<string, string>;
  devDependencies?: Record<string, string>;
};

describe("auth database migrations", () => {
  it("uses the repository-standard Drizzle Kit migration pipeline", async () => {
    expect(await Bun.file("drizzle.config.ts").exists()).toBe(true);
    expect(await Bun.file("drizzle/meta/_journal.json").exists()).toBe(true);
    expect(packageJson.scripts?.["db:generate"]).toBe("drizzle-kit generate");
    expect(packageJson.devDependencies?.["drizzle-kit"]).toBeDefined();

    const runtimeSource = await Bun.file("src/runtime-db.ts").text();
    expect(runtimeSource).toContain("drizzle-orm/libsql/migrator");
    expect(runtimeSource).not.toContain("ALTER TABLE");
    expect(runtimeSource).not.toContain("CREATE TABLE auth_users");
  });

  it("bundles auth migration assets with the public brain runtime", async () => {
    const buildSource = await Bun.file(
      "../../packages/brain-cli/scripts/build.ts",
    ).text();
    expect(buildSource).toContain('name: "auth-service"');
    expect(buildSource).toContain("shell/auth-service/drizzle");
  });
});
