import {
  access,
  chmod,
  mkdir,
  readFile,
  unlink,
  writeFile,
} from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import packageJson from "../package.json";
import { writeUsersTable } from "./render-users-table";

const starterFilePaths = [
  "pilot.yaml",
  "package.json",
  ".env.schema",
  ".gitignore",
  "cohorts/cohort-1.yaml",
  "users/alice.yaml",
  ".github/workflows/build.yml",
  ".github/workflows/deploy.yml",
  ".github/workflows/reconcile.yml",
  "deploy/Dockerfile",
  "deploy/kamal/deploy.yml",
  "deploy/scripts/helpers.ts",
  "deploy/scripts/provision-server.ts",
  "deploy/scripts/update-dns.ts",
  "deploy/scripts/write-ssh-key.ts",
  "deploy/scripts/decrypt-user-secrets.ts",
  "deploy/scripts/validate-secrets.ts",
  "deploy/scripts/write-kamal-secrets.ts",
  "deploy/scripts/resolve-user-config.ts",
  "deploy/scripts/resolve-deploy-handles.ts",
  "deploy/scripts/sync-content-repo.ts",
  ".kamal/hooks/pre-deploy",
  "docs/onboarding-checklist.md",
  "docs/operator-playbook.md",
  "docs/user-onboarding.md",
  "README.md",
] as const;

const executableStarterFilePaths = new Set<string>([".kamal/hooks/pre-deploy"]);
const templateRootDir = fileURLToPath(
  new URL("../templates/rover-pilot/", import.meta.url),
);

const legacyDeployYmlContents = [
  `service: rover
image: <%= ENV['IMAGE_REPOSITORY'] %>

servers:
  web:
    hosts:
      - <%= ENV['SERVER_IP'] %>

proxy:
  ssl:
    certificate_pem: CERTIFICATE_PEM
    private_key_pem: PRIVATE_KEY_PEM
  hosts:
    - <%= ENV['BRAIN_DOMAIN'] %>
    - <%= ENV['PREVIEW_DOMAIN'] %>
  app_port: 80
  healthcheck:
    path: /health

registry:
  server: ghcr.io
  username: <%= ENV['REGISTRY_USERNAME'] %>
  password:
    - KAMAL_REGISTRY_PASSWORD

builder:
  arch: amd64

env:
  clear:
    NODE_ENV: production
  secret:
    - AI_API_KEY
    - GIT_SYNC_TOKEN
    - MCP_AUTH_TOKEN
    - DISCORD_BOT_TOKEN

volumes:
  - /opt/brain-data:/app/brain-data
  - /opt/brain.yaml:/app/brain.yaml
`,
];

const legacyDockerfileContents = [
  `ARG BUN_VERSION=1.3.10
FROM oven/bun:\${BUN_VERSION}-slim AS runtime

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
`,
];

const legacyCaddyfileContents = [
  `# Internal Caddy — path-based routing to brain services.
# kamal-proxy terminates TLS externally; this runs inside the container.
:80 {
	@preview host *-preview.*
	handle @preview {
		reverse_proxy localhost:4321

		header {
			X-Frame-Options "SAMEORIGIN"
			X-Content-Type-Options "nosniff"
			Referrer-Policy "strict-origin-when-cross-origin"
		}
	}

	# Health endpoint
	handle /health {
		reverse_proxy localhost:3333
	}

	# MCP endpoint
	handle /mcp* {
		reverse_proxy localhost:3333

		header {
			X-Content-Type-Options "nosniff"
			Access-Control-Allow-Origin "*"
			Access-Control-Allow-Methods "GET, POST, DELETE, OPTIONS"
			Access-Control-Allow-Headers "Content-Type, Authorization, MCP-Session-Id"
		}
	}

	# A2A endpoints
	handle /.well-known/agent-card.json {
		reverse_proxy localhost:3334
	}

	handle /a2a {
		reverse_proxy localhost:3334

		header {
			X-Content-Type-Options "nosniff"
			Access-Control-Allow-Origin "*"
			Access-Control-Allow-Methods "GET, POST, OPTIONS"
			Access-Control-Allow-Headers "Content-Type, Authorization"
		}
	}

	# Plugin API routes
	handle /api/* {
		reverse_proxy localhost:3335
	}

	@root path /
	handle @root {
		redir /.well-known/agent-card.json 302
	}

	# Production site: prefer the webserver when present; otherwise fall back
	# to the A2A interface so core-only deployments never return a bare 502.
	handle {
		reverse_proxy localhost:8080 localhost:3334 {
			lb_policy first
			lb_retries 1
		}

		header {
			X-Frame-Options "SAMEORIGIN"
			X-Content-Type-Options "nosniff"
			Referrer-Policy "strict-origin-when-cross-origin"
		}
	}
}
`,
];

const reconcilableStarterFiles: Partial<
  Record<(typeof starterFilePaths)[number], string[]>
> = {
  "deploy/Dockerfile": legacyDockerfileContents,
  "deploy/kamal/deploy.yml": legacyDeployYmlContents,
};

const legacyDeployWorkflowFinalizeStep = `      - name: Commit generated config
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

const legacyReconcileWorkflowCommitStep = `      - name: Commit generated outputs
        run: |
          if git diff --quiet -- views users; then
            exit 0
          fi
          git config user.name "github-actions[bot]"
          git config user.email "41898282+github-actions[bot]@users.noreply.github.com"
          git add views users
          git commit -m "chore(ops): reconcile pilot outputs"
          git push origin HEAD:\${{ github.ref_name }}
`;

function isLegacyPilotDockerfile(current: string): boolean {
  return (
    current.includes("apt-get install -y --no-install-recommends caddy") &&
    current.includes("COPY deploy/Caddyfile /etc/caddy/Caddyfile") &&
    current.includes(
      'CMD ["sh", "-c", "caddy start --config /etc/caddy/Caddyfile && exec ./node_modules/.bin/brain start"]',
    )
  );
}

function isLegacyPilotDeployWorkflow(current: string): boolean {
  return current.includes(legacyDeployWorkflowFinalizeStep);
}

function isStalePilotDeployWorkflow(current: string): boolean {
  return (
    current.includes("name: Deploy\n") &&
    current.includes("run: bun deploy/scripts/resolve-deploy-handles.ts") &&
    current.includes("users/*/.env") &&
    !current.includes("workflow_run:\n")
  );
}

function isLegacyPilotReconcileWorkflow(current: string): boolean {
  return current.includes(legacyReconcileWorkflowCommitStep);
}

function isStaleResolveDeployHandlesScript(current: string): boolean {
  return (
    current.includes('if (eventName !== "push") {') &&
    current.includes('const currentSha = requireEnv("GITHUB_SHA");')
  );
}

export async function initPilotRepo(rootDir: string): Promise<void> {
  await mkdir(rootDir, { recursive: true });

  const usersTablePath = join(rootDir, "views", "users.md");
  let usersTableExists = true;

  try {
    await access(usersTablePath);
  } catch {
    usersTableExists = false;
  }

  const templateWrites = starterFilePaths.map(async (relativePath) => {
    const targetPath = join(rootDir, relativePath);
    await mkdir(dirname(targetPath), { recursive: true });
    await writeStarterFileIfMissing(relativePath, targetPath);
  });

  await Promise.all(templateWrites);
  await removeLegacyGeneratedFile(
    join(rootDir, "deploy", "Caddyfile"),
    legacyCaddyfileContents,
  );

  if (!usersTableExists) {
    await writeUsersTable(rootDir);
  }
}

async function writeStarterFileIfMissing(
  relativePath: (typeof starterFilePaths)[number],
  targetPath: string,
): Promise<void> {
  const content = await renderStarterFile(relativePath);
  try {
    await writeFile(targetPath, content, { flag: "wx" });
    if (executableStarterFilePaths.has(relativePath)) {
      await chmod(targetPath, 0o755);
    }
    return;
  } catch (err: unknown) {
    if (!isErrnoExceptionWithCode(err, "EEXIST")) {
      throw err;
    }
  }

  const current = await readFile(targetPath, "utf8");
  if (current === content) {
    if (executableStarterFilePaths.has(relativePath)) {
      await chmod(targetPath, 0o755);
    }
    return;
  }

  const legacyContents = reconcilableStarterFiles[relativePath] ?? [];
  const matchesLegacyContent = legacyContents.includes(current);
  const matchesLegacyPredicate =
    (relativePath === "deploy/Dockerfile" &&
      isLegacyPilotDockerfile(current)) ||
    (relativePath === ".github/workflows/deploy.yml" &&
      (isLegacyPilotDeployWorkflow(current) ||
        isStalePilotDeployWorkflow(current))) ||
    (relativePath === ".github/workflows/reconcile.yml" &&
      isLegacyPilotReconcileWorkflow(current)) ||
    (relativePath === "deploy/scripts/resolve-deploy-handles.ts" &&
      isStaleResolveDeployHandlesScript(current));
  if (!matchesLegacyContent && !matchesLegacyPredicate) {
    return;
  }

  await writeFile(targetPath, content);
  if (executableStarterFilePaths.has(relativePath)) {
    await chmod(targetPath, 0o755);
  }
}

async function removeLegacyGeneratedFile(
  path: string,
  legacyContents: string[],
): Promise<void> {
  try {
    const current = await readFile(path, "utf8");
    if (!legacyContents.includes(current)) {
      return;
    }
    await unlink(path);
  } catch (err: unknown) {
    if (isErrnoExceptionWithCode(err, "ENOENT")) {
      return;
    }
    throw err;
  }
}

async function renderStarterFile(relativePath: string): Promise<string> {
  if (relativePath === ".gitignore") {
    return "node_modules/\n.brains-ops/\nusers/*.secrets.yaml\n";
  }

  const templatePath = join(templateRootDir, relativePath);
  const templateContent = await readFile(templatePath, "utf8");
  return renderTemplate(templateContent);
}

function renderTemplate(templateContent: string): string {
  return templateContent
    .replaceAll("__BRAINS_OPS_VERSION__", packageJson.version)
    .replaceAll("__BUN_VERSION__", Bun.version);
}

function isErrnoExceptionWithCode(
  err: unknown,
  code: string,
): err is NodeJS.ErrnoException {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    err.code === code
  );
}
