import { describe, expect, it } from "bun:test";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import packageJson from "../package.json";

const packageDir = dirname(
  fileURLToPath(new URL("../package.json", import.meta.url)),
);

describe("@rizom/ops package metadata", () => {
  it("publishes built dist entrypoints and templates", () => {
    expect(packageJson.main).toBe("./dist/index.js");
    expect(packageJson.types).toBe("./dist/index.d.ts");
    expect(packageJson.bin["brains-ops"]).toBe("./dist/brains-ops.js");
    expect(packageJson.files).toEqual(["dist", "templates"]);
    expect(packageJson.scripts.build).toBeDefined();
    expect(packageJson.scripts.prepublishOnly).toBeDefined();
  });

  it("publishes the deploy subpath in the packed artifact", () => {
    const build = spawnSync("bun", ["run", "build"], {
      cwd: packageDir,
      encoding: "utf8",
    });
    expect(build.status).toBe(0);

    const pack = spawnSync("npm", ["pack", "--json", "--dry-run"], {
      cwd: packageDir,
      encoding: "utf8",
    });
    expect(pack.status).toBe(0);

    const tarballs = JSON.parse(pack.stdout) as Array<{
      files?: Array<{ path: string }>;
    }>;
    const filePaths = new Set(
      tarballs[0]?.files?.map((file) => file.path) ?? [],
    );

    expect(filePaths.has("dist/deploy.js")).toBeTrue();
    expect(filePaths.has("dist/deploy.d.ts")).toBeTrue();
  });

  it("works from a packed tarball outside the monorepo", () => {
    const build = spawnSync("bun", ["run", "build"], {
      cwd: packageDir,
      encoding: "utf8",
    });
    expect(build.status).toBe(0);

    const packDir = mkdtempSync(join(tmpdir(), "rizom-ops-pack-"));
    const pack = spawnSync("npm", ["pack", "--pack-destination", packDir], {
      cwd: packageDir,
      encoding: "utf8",
    });
    expect(pack.status).toBe(0);

    const tarball = pack.stdout.trim().split(/\r?\n/).pop();
    expect(tarball).toBeDefined();
    if (!tarball) {
      throw new Error("npm pack did not return a tarball filename");
    }

    const projectDir = mkdtempSync(join(tmpdir(), "rizom-ops-smoke-"));
    writeFileSync(
      join(projectDir, "package.json"),
      JSON.stringify(
        {
          name: "rizom-ops-smoke",
          private: true,
          type: "module",
        },
        null,
        2,
      ),
    );

    const install = spawnSync("bun", ["add", join(packDir, tarball)], {
      cwd: projectDir,
      encoding: "utf8",
    });
    expect(install.status).toBe(0);

    const version = spawnSync("./node_modules/.bin/brains-ops", ["version"], {
      cwd: projectDir,
      encoding: "utf8",
    });
    expect(version.status).toBe(0);

    const init = spawnSync("./node_modules/.bin/brains-ops", ["init", "demo"], {
      cwd: projectDir,
      encoding: "utf8",
    });
    expect(init.status).toBe(0);
    expect(existsSync(join(projectDir, "demo", "pilot.yaml"))).toBeTrue();

    writeFileSync(
      join(projectDir, "smoke.ts"),
      [
        'import { parseArgs } from "@rizom/ops";',
        'import { parseEnvSchema, parseEnvSchemaFile } from "@rizom/ops/deploy";',
        'import { writeFileSync } from "node:fs";',
        'const parsed = parseArgs(["render", "demo"]);',
        'if (parsed.command !== "render") throw new Error("bad command");',
        'writeFileSync(".env.schema", "# @required\\nSECRET=\\n", "utf8");',
        'const inline = parseEnvSchema("# @required\\nSECRET=\\n");',
        'const file = parseEnvSchemaFile(".env.schema");',
        "console.log(parsed.command, inline[0]?.key, file[0]?.key);",
      ].join("\n"),
      "utf8",
    );

    const smoke = spawnSync("bun", ["run", "smoke.ts"], {
      cwd: projectDir,
      encoding: "utf8",
    });
    expect(smoke.status).toBe(0);
  });

  it("does not publish with workspace runtime dependencies", () => {
    const dependencies = packageJson.dependencies ?? {};
    const dependencyValues = Object.values(dependencies);
    expect(
      dependencyValues.some((value) => value === "workspace:*"),
    ).toBeFalse();
    expect(Object.hasOwn(dependencies, "@brains/utils")).toBeFalse();
    expect(Object.hasOwn(dependencies, "zod")).toBeFalse();
  });
});
