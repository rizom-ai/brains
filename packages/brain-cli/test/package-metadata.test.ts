import { describe, expect, it } from "bun:test";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import packageJson from "../package.json";

const packageDir = dirname(
  fileURLToPath(new URL("../package.json", import.meta.url)),
);
const monorepoRoot = dirname(dirname(packageDir));

function readPackageFile(relativePath: string): string {
  return readFileSync(join(packageDir, relativePath), "utf8");
}

function readSharedFile(relativePath: string): string {
  return readFileSync(
    join(monorepoRoot, "shared", "utils", "src", relativePath),
    "utf8",
  );
}

function readSharedTsConfigFile(relativePath: string): string {
  return readFileSync(
    join(monorepoRoot, "shared", "typescript-config", relativePath),
    "utf8",
  );
}

describe("@rizom/brain package metadata", () => {
  it("keeps package-local deploy templates synced from shared source", () => {
    expect(readPackageFile("templates/deploy/Dockerfile")).toBe(
      readSharedFile("deploy-templates/Dockerfile"),
    );
    expect(readPackageFile("templates/deploy/kamal-deploy.yml")).toBe(
      readSharedFile("deploy-templates/kamal-deploy.yml"),
    );
    expect(
      readPackageFile("templates/deploy/scripts/provision-server.ts"),
    ).toBe(readSharedFile("deploy-scripts/provision-server.ts"));
    expect(readPackageFile("templates/deploy/scripts/update-dns.ts")).toBe(
      readSharedFile("deploy-scripts/update-dns.ts"),
    );
    expect(readPackageFile("templates/deploy/scripts/write-ssh-key.ts")).toBe(
      readSharedFile("deploy-scripts/write-ssh-key.ts"),
    );
  });

  it("keeps the public instance tsconfig preset synced from shared source", () => {
    expect(readPackageFile("tsconfig.instance.json")).toBe(
      readSharedTsConfigFile("instance.json"),
    );
  });

  it("publishes deploy templates in the packed artifact", () => {
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

    expect(packageJson.files).toContain("templates");
    expect(packageJson.files).toContain("tsconfig.instance.json");
    expect(filePaths.has("templates/deploy/Dockerfile")).toBeTrue();
    expect(filePaths.has("templates/deploy/kamal-deploy.yml")).toBeTrue();
    expect(
      filePaths.has("templates/deploy/scripts/provision-server.ts"),
    ).toBeTrue();
    expect(filePaths.has("templates/deploy/scripts/update-dns.ts")).toBeTrue();
    expect(
      filePaths.has("templates/deploy/scripts/write-ssh-key.ts"),
    ).toBeTrue();
    expect(filePaths.has("tsconfig.instance.json")).toBeTrue();
  });

  it("can scaffold deploy files from a packed install outside the monorepo", () => {
    const build = spawnSync("bun", ["run", "build"], {
      cwd: packageDir,
      encoding: "utf8",
    });
    expect(build.status).toBe(0);

    const packDir = mkdtempSync(join(tmpdir(), "rizom-brain-pack-"));
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

    const projectDir = mkdtempSync(join(tmpdir(), "rizom-brain-smoke-"));
    writeFileSync(
      join(projectDir, "package.json"),
      JSON.stringify(
        {
          name: "rizom-brain-smoke",
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

    const init = spawnSync(
      "./node_modules/.bin/brain",
      ["init", "demo", "--deploy", "--model", "rover"],
      {
        cwd: projectDir,
        encoding: "utf8",
      },
    );
    expect(init.status).toBe(0);
    expect(
      existsSync(join(projectDir, "demo", "deploy", "Dockerfile")),
    ).toBeTrue();
    expect(
      existsSync(
        join(projectDir, "demo", "deploy", "scripts", "provision-server.ts"),
      ),
    ).toBeTrue();
    expect(
      existsSync(
        join(projectDir, "demo", "deploy", "scripts", "update-dns.ts"),
      ),
    ).toBeTrue();
    expect(
      existsSync(
        join(projectDir, "demo", "deploy", "scripts", "write-ssh-key.ts"),
      ),
    ).toBeTrue();

    const dockerfile = readFileSync(
      join(projectDir, "demo", "deploy", "Dockerfile"),
      "utf8",
    );
    const tsconfig = JSON.parse(
      readFileSync(join(projectDir, "demo", "tsconfig.json"), "utf8"),
    );

    expect(dockerfile).toContain(
      "FROM oven/bun:${BUN_VERSION}-slim AS runtime",
    );
    expect(dockerfile).toContain("FROM runtime AS standalone");
    expect(dockerfile).toContain("EXPOSE 8080");
    expect(dockerfile).toContain('CMD ["./node_modules/.bin/brain", "start"]');
    expect(tsconfig).toMatchObject({
      extends: "@rizom/brain/tsconfig.instance.json",
      compilerOptions: {
        jsx: "react-jsx",
        jsxImportSource: "preact",
      },
    });
  }, 15000);
});
