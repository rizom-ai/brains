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

function readSharedFile(relativePath: string): string {
  return readFileSync(
    join(monorepoRoot, "shared", "utils", "src", relativePath),
    "utf8",
  );
}

const legacyPilotDockerfile = `ARG BUN_VERSION=1.3.10
FROM oven/bun:${"${BUN_VERSION}"}-slim AS runtime

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    curl ca-certificates git gnupg debian-keyring debian-archive-keyring apt-transport-https \
    && curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg \
    && curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | tee /etc/apt/sources.list.d/caddy-stable.list \
    && apt-get update && apt-get install -y --no-install-recommends caddy libcap2-bin \
    && setcap cap_net_bind_service=+ep $(which caddy) \
    && rm -rf /var/lib/apt/lists/*

COPY deploy/Caddyfile /etc/caddy/Caddyfile

RUN mkdir -p /srv/fallback && \
    printf '<!doctype html><html><head><meta charset="utf-8"><title>brain</title></head><body></body></html>\n' \
    > /srv/fallback/index.html

ENV XDG_DATA_HOME=/data
ENV XDG_CONFIG_HOME=/config
RUN mkdir -p /app/data /app/cache /app/brain-data && \
    chmod -R 777 /app/data /app/cache /app/brain-data

CMD ["sh", "-c", "caddy start --config /etc/caddy/Caddyfile && exec ./node_modules/.bin/brain start"]

# --- standalone: bake full project into image (brain-cli deploy) ---
FROM runtime AS standalone
COPY package.json ./package.json
RUN bun install --production --ignore-scripts
COPY . .

# --- fleet: install published brain at pinned version (ops deploy) ---
FROM runtime AS fleet
ARG BRAIN_VERSION
RUN test -n "$BRAIN_VERSION" \
 && printf '{"name":"rover-pilot-runtime","private":true}\n' > package.json \
 && bun add @rizom/brain@$BRAIN_VERSION
`;

const legacyDeployWorkflowCommitStep = `      - name: Commit generated config
        run: |
          if git diff --quiet -- users views; then
            exit 0
          fi
          git config user.name "github-actions[bot]"
          git config user.email "41898282+github-actions[bot]@users.noreply.github.com"
          git add users views
          git commit -m "chore(ops): reconcile generated config"
          git push origin HEAD:\${{ github.ref_name }}
`;

describe("@rizom/ops package metadata", () => {
  it("keeps the shared deploy template source up to date", () => {
    const deployTemplate = readSharedFile("deploy-templates/kamal-deploy.yml");
    const dockerfile = readSharedFile("deploy-templates/Dockerfile");

    expect(deployTemplate).toContain("/opt/brain-state:/data");
    expect(deployTemplate).toContain("/opt/brain-config:/config");
    expect(deployTemplate).toContain("/opt/brain-dist:/app/dist");
    expect(dockerfile).toContain("ENV XDG_DATA_HOME=/data");
    expect(dockerfile).toContain("ENV XDG_CONFIG_HOME=/config");
  });

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

  it("reconciles legacy deploy Dockerfiles from a packed tarball outside the monorepo", () => {
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

    const projectDir = mkdtempSync(join(tmpdir(), "rizom-ops-reconcile-"));
    writeFileSync(
      join(projectDir, "package.json"),
      JSON.stringify(
        {
          name: "rizom-ops-reconcile",
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

    const init = spawnSync("./node_modules/.bin/brains-ops", ["init", "demo"], {
      cwd: projectDir,
      encoding: "utf8",
    });
    expect(init.status).toBe(0);

    writeFileSync(
      join(projectDir, "demo", "deploy", "Dockerfile"),
      legacyPilotDockerfile,
      "utf8",
    );

    const rerun = spawnSync(
      "./node_modules/.bin/brains-ops",
      ["init", "demo"],
      {
        cwd: projectDir,
        encoding: "utf8",
      },
    );
    expect(rerun.status).toBe(0);

    const dockerfile = readFileSync(
      join(projectDir, "demo", "deploy", "Dockerfile"),
      "utf8",
    );
    expect(dockerfile).toContain("EXPOSE 8080");
    expect(dockerfile).not.toContain("deploy/Caddyfile");
    expect(dockerfile).not.toContain("caddy start");
  });

  it("reconciles legacy deploy workflow push steps from a packed tarball outside the monorepo", () => {
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

    const projectDir = mkdtempSync(join(tmpdir(), "rizom-ops-workflow-"));
    writeFileSync(
      join(projectDir, "package.json"),
      JSON.stringify(
        {
          name: "rizom-ops-workflow",
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

    const init = spawnSync("./node_modules/.bin/brains-ops", ["init", "demo"], {
      cwd: projectDir,
      encoding: "utf8",
    });
    expect(init.status).toBe(0);

    const deployWorkflowPath = join(
      projectDir,
      "demo",
      ".github",
      "workflows",
      "deploy.yml",
    );
    const deployWorkflow = readFileSync(deployWorkflowPath, "utf8");
    writeFileSync(
      deployWorkflowPath,
      deployWorkflow.replace(
        / {6}- name: Commit generated config[\s\S]*?git push origin HEAD:\$\{\{ github\.ref_name \}\}\n/,
        legacyDeployWorkflowCommitStep,
      ),
      "utf8",
    );

    const rerun = spawnSync(
      "./node_modules/.bin/brains-ops",
      ["init", "demo"],
      {
        cwd: projectDir,
        encoding: "utf8",
      },
    );
    expect(rerun.status).toBe(0);

    const reconciledWorkflow = readFileSync(deployWorkflowPath, "utf8");
    expect(reconciledWorkflow).toContain(
      'git fetch origin "${{ github.ref_name }}"',
    );
    expect(reconciledWorkflow).not.toContain(legacyDeployWorkflowCommitStep);
  });

  it("does not publish with workspace runtime dependencies", () => {
    const dependencies = packageJson.dependencies;
    const dependencyValues = Object.values(dependencies);
    expect(
      dependencyValues.some((value) => value === "workspace:*"),
    ).toBeFalse();
    expect(Object.hasOwn(dependencies, "@brains/utils")).toBeFalse();
    expect(Object.hasOwn(dependencies, "zod")).toBeFalse();
  });
});
