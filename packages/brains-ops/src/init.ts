import { access, mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import { writeUsersTable } from "./render-users-table";

const starterFiles = {
  "pilot.yaml": `schemaVersion: 1
brainVersion: 0.1.1-alpha.14
model: rover
githubOrg: <github-org>
contentRepoPrefix: rover-
domainSuffix: .rizom.ai
preset: core
aiApiKey: AI_API_KEY
`,
  "cohorts/cohort-1.yaml": `members:
  - alice
`,
  "users/alice.yaml": `handle: alice
discord:
  enabled: false
`,
  ".github/workflows/build.yml": `name: Build

on:
  workflow_dispatch:

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - run: echo "TODO: scaffold shared rover-pilot image build workflow"
`,
  ".github/workflows/deploy.yml": `name: Deploy

on:
  workflow_dispatch:
    inputs:
      handle:
        description: User handle
        required: true

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - run: echo "TODO: scaffold shared rover-pilot per-user deploy workflow"
`,
  ".github/workflows/reconcile.yml": `name: Reconcile

on:
  workflow_dispatch:
  push:
    paths:
      - pilot.yaml
      - cohorts/**
      - users/*.yaml

jobs:
  reconcile:
    runs-on: ubuntu-latest
    steps:
      - run: echo "TODO: scaffold shared rover-pilot reconcile workflow"
`,
  "deploy/kamal/deploy.yml": `# Shared Kamal config for rover-pilot.
# brains-ops will expand per-user destinations from registry data.
`,
  "docs/onboarding-checklist.md": `# Onboarding Checklist

1. Fill in \`pilot.yaml\`.
2. Add or edit \`users/<handle>.yaml\`.
3. Add the user to a cohort in \`cohorts/*.yaml\`.
4. Run \`brains-ops render <repo>\`.
5. Run \`brains-ops onboard <repo> <handle>\`.
6. Hand the MCP connection details to the user.
`,
  "docs/operator-playbook.md": `# Operator Playbook

Document known failure modes, recovery steps, and operator notes here.
`,
  "README.md": `# rover-pilot

Private desired-state repo for the rover pilot.

This is a single operator-owned repo. Pilot users do not get their own brain repos.
Per-user deploy config lives under \`users/<handle>/\`, while content stays in per-user content repos.

## Commands

- \`brains-ops init <repo>\`
- \`brains-ops render <repo>\`
- \`brains-ops onboard <repo> <handle>\`
- \`brains-ops reconcile-cohort <repo> <cohort>\`
- \`brains-ops reconcile-all <repo>\`
`,
} satisfies Record<string, string>;

export async function initPilotRepo(rootDir: string): Promise<void> {
  await mkdir(rootDir, { recursive: true });

  const usersTablePath = join(rootDir, "views", "users.md");
  let usersTableExists = true;

  try {
    await access(usersTablePath);
  } catch {
    usersTableExists = false;
  }

  for (const [relativePath, content] of Object.entries(starterFiles)) {
    const fullPath = join(rootDir, relativePath);
    await mkdir(dirname(fullPath), { recursive: true });
    await writeIfMissing(fullPath, content);
  }

  if (!usersTableExists) {
    await writeUsersTable(rootDir);
  }
}

async function writeIfMissing(
  filePath: string,
  content: string,
): Promise<void> {
  try {
    await access(filePath);
    return;
  } catch {
    await writeFile(filePath, content);
  }
}
